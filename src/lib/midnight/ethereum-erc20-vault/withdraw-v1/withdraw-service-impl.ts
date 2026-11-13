import 'server-only'

import { randomUUID } from 'node:crypto'

import { newInputIndex } from '@sig-net/midnight-examples-erc20-vault-contract'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { nextState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import {
  type AttestedRequestFields,
  attestedRequestFields,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import {
  type Withdraw,
  type WithdrawCompleteInputs,
  withdrawName,
  type WithdrawStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import type { WithdrawRepository } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-repository'
import type {
  CompleteWithdrawArgs,
  GetWithdrawArgs,
  ListWithdrawsArgs,
  PrepareCompleteWithdrawArgs,
  PrepareStartWithdrawArgs,
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
  private readonly unitOfWork: UnitOfWork
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    withdrawRepository: WithdrawRepository,
    withdrawStateController: WithdrawStateController,
    vaultRequestRepository: VaultRequestRepository,
    unitOfWork: UnitOfWork,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.withdrawRepository = withdrawRepository
    this.withdrawStateController = withdrawStateController
    this.vaultRequestRepository = vaultRequestRepository
    this.unitOfWork = unitOfWork
    this.signet = signet
    this.vault = vault
  }

  async prepareStartWithdraw(
    _caller: Caller,
    _args: PrepareStartWithdrawArgs,
  ): Promise<WithdrawStartInputs> {
    return { inIndex: newInputIndex() }
  }

  async startWithdraw(
    caller: Caller,
    { withdrawRequest, userCommitment, inIndex, finalizedTx }: StartWithdrawArgs,
  ): Promise<Withdraw> {
    return this.unitOfWork.runInTransaction(() =>
      this.withdrawStateController.startWithdraw({
        name: withdrawName(caller.name, randomUUID()),
        ...withdrawRequest,
        inIndex,
        userCommitment,
        vaultAccount: vaultAccountOf(this.signet, this.vault),
        call: { finalizedTx },
      }),
    )
  }

  async prepareCompleteWithdraw(
    caller: Caller,
    { name }: PrepareCompleteWithdrawArgs,
  ): Promise<WithdrawCompleteInputs> {
    await this.assertCompletable(caller, name)
    const { requestId, attestationOutputKind, attestationOutput } =
      await this.attestedRequestOf(name)
    return { requestId, attestationOutputKind, attestationOutput }
  }

  async completeWithdraw(
    caller: Caller,
    { name, finalizedTx }: CompleteWithdrawArgs,
  ): Promise<Withdraw> {
    await this.assertCompletable(caller, name)
    return this.unitOfWork.runInTransaction(() =>
      this.withdrawStateController.completeWithdraw({ name, call: { finalizedTx } }),
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

  /** The state table is asked here, outside the lock, and the controller asks it again under it. */
  private async assertCompletable(caller: Caller, name: string): Promise<void> {
    const withdraw = await this.ownWithdraw(caller, name)
    if (nextState(withdraw.state, 'complete') === undefined) {
      throw new WithdrawStateConflict(name, withdraw.state, 'complete')
    }
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
