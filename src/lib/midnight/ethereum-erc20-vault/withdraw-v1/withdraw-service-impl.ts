import 'server-only'

import { randomUUID } from 'node:crypto'

import { hexToBytes } from '@sig-net/midnight'
import { newInputIndex } from '@sig-net/midnight-examples-erc20-vault-contract'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { nextState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type { VaultCircuits } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import {
  type AttestedRequestFields,
  attestedRequestFields,
  completionOutput,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import { vaultTokenType } from '@/lib/midnight/ethereum-erc20-vault/vault-token-infos'
import {
  type Withdraw,
  withdrawName,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import type { WithdrawRepository } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-repository'
import type {
  CompleteWithdrawArgs,
  GetWithdrawArgs,
  ListWithdrawsArgs,
  StartWithdrawArgs,
  WithdrawService,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import {
  type WithdrawStateController,
  WithdrawStateConflict,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-controller'

export class WithdrawServiceImpl implements WithdrawService {
  private readonly withdrawRepository: WithdrawRepository
  private readonly withdrawStateController: WithdrawStateController
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly circuits: VaultCircuits
  private readonly unitOfWork: UnitOfWork
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    withdrawRepository: WithdrawRepository,
    withdrawStateController: WithdrawStateController,
    vaultRequestRepository: VaultRequestRepository,
    circuits: VaultCircuits,
    unitOfWork: UnitOfWork,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.withdrawRepository = withdrawRepository
    this.withdrawStateController = withdrawStateController
    this.vaultRequestRepository = vaultRequestRepository
    this.circuits = circuits
    this.unitOfWork = unitOfWork
    this.signet = signet
    this.vault = vault
  }

  async startWithdraw(
    caller: Caller,
    { withdrawRequest, wallet }: StartWithdrawArgs,
  ): Promise<Withdraw> {
    const inIndex = newInputIndex()
    const unprovenTx = await this.circuits.startWithdraw({
      secretKey: caller.secretKey,
      wallet,
      inIndex,
      ...withdrawRequest,
      coinType: vaultTokenType(withdrawRequest.erc20Address, this.vault.contractAddress),
    })
    return this.unitOfWork.runInTransaction(() =>
      this.withdrawStateController.startWithdraw({
        name: withdrawName(caller.name, randomUUID()),
        ...withdrawRequest,
        inIndex,
        vaultAccount: vaultAccountOf(this.signet, this.vault),
        call: { unprovenTx },
      }),
    )
  }

  /** The state table is asked before the slow build, and the controller asks it again under the lock. */
  async completeWithdraw(
    caller: Caller,
    { name, wallet }: CompleteWithdrawArgs,
  ): Promise<Withdraw> {
    const withdraw = await this.ownWithdraw(caller, name)
    if (nextState(withdraw.state, 'complete') === undefined) {
      throw new WithdrawStateConflict(name, withdraw.state, 'complete')
    }
    const request = await this.attestedRequestOf(name)
    const unprovenTx = await this.circuits.completeWithdraw({
      secretKey: caller.secretKey,
      wallet,
      requestId: hexToBytes(request.requestId),
      serializedOutput: completionOutput(request, 1),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    })
    return this.unitOfWork.runInTransaction(() =>
      this.withdrawStateController.completeWithdraw({ name, call: { unprovenTx } }),
    )
  }

  async getWithdraw(caller: Caller, args: GetWithdrawArgs): Promise<Withdraw | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.withdrawRepository.get(args.name)
  }

  async listWithdraws(caller: Caller, _args: ListWithdrawsArgs): Promise<Withdraw[]> {
    return this.withdrawRepository.search({
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller.name}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  private async ownWithdraw(caller: Caller, name: string): Promise<Withdraw> {
    const withdraw = resourceOwnedByCaller(name, caller)
      ? await this.withdrawRepository.get(name)
      : undefined
    if (withdraw === undefined) {
      throw new Error(`${name} does not exist`)
    }
    return withdraw
  }

  /** A withdrawal that may be completed has an attested request under it, so its fields are read without a state check. */
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
