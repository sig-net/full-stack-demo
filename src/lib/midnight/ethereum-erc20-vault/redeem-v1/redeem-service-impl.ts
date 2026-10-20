import 'server-only'

import { randomUUID } from 'node:crypto'

import { bytesToHex } from '@sig-net/midnight'
import { newInputIndex } from '@sig-net/midnight-examples-erc20-vault-contract'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { nextState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import {
  type Redeem,
  type RedeemCompleteInputs,
  redeemName,
  type RedeemStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { RedeemRepository } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-repository'
import type {
  CompleteRedeemArgs,
  GetRedeemArgs,
  ListRedeemsArgs,
  PrepareCompleteRedeemArgs,
  PrepareStartRedeemArgs,
  RedeemService,
  StartRedeemArgs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service'
import {
  type RedeemStateController,
  RedeemStateConflict,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-controller'
import type { SponsoredCallGuard } from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type { SpenderLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import {
  type AttestedRequestFields,
  attestedRequestFields,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'

export class RedeemServiceImpl implements RedeemService {
  private readonly redeemRepository: RedeemRepository
  private readonly redeemStateController: RedeemStateController
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly ledger: SpenderLedger
  private readonly unitOfWork: UnitOfWork
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig
  private readonly guard: SponsoredCallGuard

  constructor(
    redeemRepository: RedeemRepository,
    redeemStateController: RedeemStateController,
    vaultRequestRepository: VaultRequestRepository,
    ledger: SpenderLedger,
    unitOfWork: UnitOfWork,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
    guard: SponsoredCallGuard,
  ) {
    this.redeemRepository = redeemRepository
    this.redeemStateController = redeemStateController
    this.vaultRequestRepository = vaultRequestRepository
    this.ledger = ledger
    this.unitOfWork = unitOfWork
    this.signet = signet
    this.vault = vault
    this.guard = guard
  }

  async prepareStartRedeem(
    _caller: Caller,
    _args: PrepareStartRedeemArgs,
  ): Promise<RedeemStartInputs> {
    const { stataErc20Address } = await this.stataPair()
    return { inIndex: newInputIndex(), stataErc20Address }
  }

  async startRedeem(
    caller: Caller,
    { redeemRequest, inIndex, boundTx }: StartRedeemArgs,
  ): Promise<Redeem> {
    this.guard.assertSponsoredCall(boundTx, 'startRedeem')
    const pair = await this.stataPair()
    return this.unitOfWork.runInTransaction(() =>
      this.redeemStateController.startRedeem({
        name: redeemName(caller.name, randomUUID()),
        ...pair,
        shares: redeemRequest.shares,
        inIndex,
        vaultAccount: vaultAccountOf(this.signet, this.vault),
        call: { boundTx },
      }),
    )
  }

  async prepareCompleteRedeem(
    caller: Caller,
    { name }: PrepareCompleteRedeemArgs,
  ): Promise<RedeemCompleteInputs> {
    await this.assertCompletable(caller, name)
    const { requestId, attestationOutputKind, attestationOutput } =
      await this.attestedRequestOf(name)
    return { requestId, attestationOutputKind, attestationOutput }
  }

  async completeRedeem(caller: Caller, { name, boundTx }: CompleteRedeemArgs): Promise<Redeem> {
    this.guard.assertSponsoredCall(boundTx, 'completeRedeem')
    await this.assertCompletable(caller, name)
    return this.unitOfWork.runInTransaction(() =>
      this.redeemStateController.completeRedeem({ name, call: { boundTx } }),
    )
  }

  async getRedeem(caller: Caller, args: GetRedeemArgs): Promise<Redeem | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.redeemRepository.get(args.name)
  }

  async listRedeems(caller: Caller, _args: ListRedeemsArgs): Promise<Redeem[]> {
    return this.redeemRepository.search({
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller.name}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  /** The pair the deployer pinned at initialisation, which every redeem moves between. */
  private async stataPair(): Promise<Pick<Redeem, 'stataErc20Address' | 'underlyingErc20Address'>> {
    const state = await this.ledger.state()
    return {
      underlyingErc20Address: `0x${bytesToHex(state.stataUnderlying)}`,
      stataErc20Address: `0x${bytesToHex(state.stataToken)}`,
    }
  }

  /** The state table is asked here, outside the lock, and the controller asks it again under it. */
  private async assertCompletable(caller: Caller, name: string): Promise<void> {
    const redeem = await this.ownRedeem(caller, name)
    if (nextState(redeem.state, 'complete') === undefined) {
      throw new RedeemStateConflict(name, redeem.state, 'complete')
    }
  }

  private async ownRedeem(caller: Caller, name: string): Promise<Redeem> {
    const redeem = resourceOwnedByCaller(name, caller)
      ? await this.redeemRepository.get(name)
      : undefined
    if (redeem === undefined) {
      throw new Error(`${name} does not exist`)
    }
    return redeem
  }

  /** A redeem that may be completed has an attested request under it, so its fields are read without a state check. */
  private async attestedRequestOf(name: string): Promise<AttestedRequestFields> {
    const [request] = await this.vaultRequestRepository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: name }],
      order: { field: 'createTime', direction: 'desc' },
      limit: 1,
    })
    if (request === undefined) {
      throw new Error(`${name} has no vault request`)
    }
    return attestedRequestFields(request)
  }
}
