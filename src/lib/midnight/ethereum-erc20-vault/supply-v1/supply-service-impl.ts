import 'server-only'

import { randomUUID } from 'node:crypto'

import { bytesToHex } from '@sig-net/midnight'
import { newInputIndex } from '@sig-net/midnight-examples-erc20-vault-contract'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { nextState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import {
  type Supply,
  type SupplyCompleteInputs,
  supplyName,
  type SupplyStartInputs,
  type SupplyTarget,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { SupplyRepository } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-repository'
import type {
  CompleteSupplyArgs,
  GetSupplyArgs,
  GetSupplyTargetArgs,
  ListSuppliesArgs,
  PrepareCompleteSupplyArgs,
  PrepareStartSupplyArgs,
  StartSupplyArgs,
  SupplyService,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import {
  type SupplyStateController,
  SupplyStateConflict,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import {
  assertVaultInitialised,
  type SpenderLedger,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import {
  type AttestedRequestFields,
  attestedRequestFields,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'

export class SupplyServiceImpl implements SupplyService {
  private readonly supplyRepository: SupplyRepository
  private readonly supplyStateController: SupplyStateController
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly ledger: SpenderLedger
  private readonly erc20Reader: Erc20Reader
  private readonly unitOfWork: UnitOfWork
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    supplyRepository: SupplyRepository,
    supplyStateController: SupplyStateController,
    vaultRequestRepository: VaultRequestRepository,
    ledger: SpenderLedger,
    erc20Reader: Erc20Reader,
    unitOfWork: UnitOfWork,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.supplyRepository = supplyRepository
    this.supplyStateController = supplyStateController
    this.vaultRequestRepository = vaultRequestRepository
    this.ledger = ledger
    this.erc20Reader = erc20Reader
    this.unitOfWork = unitOfWork
    this.signet = signet
    this.vault = vault
  }

  async getSupplyTarget(_caller: Caller, _args: GetSupplyTargetArgs): Promise<SupplyTarget> {
    const pair = await this.stataPair()
    return {
      ...pair,
      allowance: await this.erc20Reader.allowance(
        pair.underlyingErc20Address,
        vaultAccountOf(this.signet, this.vault),
        pair.stataErc20Address,
      ),
    }
  }

  async prepareStartSupply(
    _caller: Caller,
    _args: PrepareStartSupplyArgs,
  ): Promise<SupplyStartInputs> {
    const { underlyingErc20Address } = await this.stataPair()
    return { inIndex: newInputIndex(), underlyingErc20Address }
  }

  async startSupply(
    caller: Caller,
    { supplyRequest, inIndex, finalizedTx }: StartSupplyArgs,
  ): Promise<Supply> {
    const pair = await this.stataPair()
    return this.unitOfWork.runInTransaction(() =>
      this.supplyStateController.startSupply({
        name: supplyName(caller.name, randomUUID()),
        ...pair,
        amount: supplyRequest.amount,
        inIndex,
        vaultAccount: vaultAccountOf(this.signet, this.vault),
        call: { finalizedTx },
      }),
    )
  }

  async prepareCompleteSupply(
    caller: Caller,
    { name }: PrepareCompleteSupplyArgs,
  ): Promise<SupplyCompleteInputs> {
    await this.assertCompletable(caller, name)
    const { requestId, attestationOutputKind, attestationOutput } =
      await this.attestedRequestOf(name)
    return { requestId, attestationOutputKind, attestationOutput }
  }

  async completeSupply(caller: Caller, { name, finalizedTx }: CompleteSupplyArgs): Promise<Supply> {
    await this.assertCompletable(caller, name)
    return this.unitOfWork.runInTransaction(() =>
      this.supplyStateController.completeSupply({ name, call: { finalizedTx } }),
    )
  }

  async getSupply(caller: Caller, args: GetSupplyArgs): Promise<Supply | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.supplyRepository.get(args.name)
  }

  async listSupplies(caller: Caller, _args: ListSuppliesArgs): Promise<Supply[]> {
    return this.supplyRepository.search({
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller.name}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  /** The pair the deployer pinned at initialisation, which every supply moves between. */
  private async stataPair(): Promise<
    Pick<SupplyTarget, 'underlyingErc20Address' | 'stataErc20Address'>
  > {
    const state = await this.ledger.state()
    assertVaultInitialised(state)
    return {
      underlyingErc20Address: `0x${bytesToHex(state.stataUnderlying)}`,
      stataErc20Address: `0x${bytesToHex(state.stataToken)}`,
    }
  }

  /** The state table is asked here, outside the lock, and the controller asks it again under it. */
  private async assertCompletable(caller: Caller, name: string): Promise<void> {
    const supply = await this.ownSupply(caller, name)
    if (nextState(supply.state, 'complete') === undefined) {
      throw new SupplyStateConflict(name, supply.state, 'complete')
    }
  }

  private async ownSupply(caller: Caller, name: string): Promise<Supply> {
    const supply = resourceOwnedByCaller(name, caller)
      ? await this.supplyRepository.get(name)
      : undefined
    if (supply === undefined) {
      throw new Error(`${name} does not exist`)
    }
    return supply
  }

  /** A supply that may be completed has an attested request under it, so its fields are read without a state check. */
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
