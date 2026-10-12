import 'server-only'

import { randomUUID } from 'node:crypto'

import { callerOf } from '@/lib/caller/caller'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import {
  type CompleteDepositArgs,
  DEPOSIT_EVENT_BY_STATE,
  DepositStateConflict,
  type DepositStateController,
  type RecordAttestedArgs,
  type RecordCompletedArgs,
  type RecordCompleteFailureArgs,
  type RecordStartedArgs,
  type RecordStartFailureArgs,
  type StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import {
  assertConsistent,
  type DepositStateAction,
  INITIAL_STATE,
  nextState,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-machine'
import { vaultRequestName } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { midnightTransactionName } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'

export class DepositStateControllerImpl implements DepositStateController {
  private readonly depositRepository: DepositRepository
  private readonly eventPublisher: EventPublisher
  private readonly midnightTransactionStateController: MidnightTransactionStateController
  private readonly vaultRequestStateController: VaultRequestStateController

  constructor(
    depositRepository: DepositRepository,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    vaultRequestStateController: VaultRequestStateController,
  ) {
    this.depositRepository = depositRepository
    this.eventPublisher = eventPublisher
    this.midnightTransactionStateController = midnightTransactionStateController
    this.vaultRequestStateController = vaultRequestStateController
  }

  async startDeposit({ unprovenTx, ...deposit }: StartDepositArgs): Promise<Deposit> {
    const now = new Date()
    const stored = await this.depositRepository.create({
      ...deposit,
      state: INITIAL_STATE,
      outcome: null,
      failure: null,
      error: null,
      createTime: now,
      updateTime: now,
    })
    await this.eventPublisher.publishEvent(
      DEPOSIT_EVENT_BY_STATE[stored.state].create(stored.name, { name: stored.name }),
    )
    await this.midnightTransactionStateController.commitTransaction({
      name: midnightTransactionName(callerOf(stored.name), randomUUID()),
      parent: stored.name,
      circuit: 'startDeposit',
      signer: 'caller',
      unprovenTx,
    })
    return stored
  }

  async recordStarted({ name }: RecordStartedArgs): Promise<Deposit> {
    const started = await this.transition(name, 'recordStarted', {})
    await this.vaultRequestStateController.queueRequest({
      name: vaultRequestName(callerOf(name), randomUUID()),
      parent: name,
      action: 'deposit',
      inIndex: started.inIndex,
      depositAccount: started.depositAccount,
    })
    return started
  }

  recordStartFailure({ name, error }: RecordStartFailureArgs): Promise<Deposit> {
    return this.transition(name, 'recordStartFailure', { failure: 'StartFailed', error })
  }

  recordAttested({ name }: RecordAttestedArgs): Promise<Deposit> {
    return this.transition(name, 'recordAttested', {})
  }

  async completeDeposit({ name, unprovenTx }: CompleteDepositArgs): Promise<Deposit> {
    const completing = await this.transition(name, 'complete', {})
    await this.midnightTransactionStateController.commitTransaction({
      name: midnightTransactionName(callerOf(completing.name), randomUUID()),
      parent: completing.name,
      circuit: 'completeDeposit',
      signer: 'caller',
      unprovenTx,
    })
    return completing
  }

  recordCompleted({ name, outcome }: RecordCompletedArgs): Promise<Deposit> {
    return this.transition(name, 'recordCompleted', { outcome })
  }

  recordCompleteFailure({ name }: RecordCompleteFailureArgs): Promise<Deposit> {
    return this.transition(name, 'recordCompleteFailure', {})
  }

  /** The row is read locked, so two actors applying actions at once are serialised and the second sees the state the first left. */
  private async transition(
    name: string,
    action: DepositStateAction,
    patch: Partial<Deposit>,
  ): Promise<Deposit> {
    const [current] = await this.depositRepository.search({
      criteria: [{ type: 'exact-text', field: 'name', text: name }],
      lock: 'update',
    })
    if (current === undefined) {
      throw new Error(`${name} does not exist`)
    }
    const state = nextState(current.state, action)
    if (state === undefined) {
      throw new DepositStateConflict(name, current.state, action)
    }
    const next: Deposit = { ...current, ...patch, state, updateTime: new Date() }
    assertConsistent(next)
    const stored = await this.depositRepository.update(next)
    await this.eventPublisher.publishEvent(
      DEPOSIT_EVENT_BY_STATE[stored.state].create(stored.name, { name: stored.name }),
    )
    return stored
  }
}
