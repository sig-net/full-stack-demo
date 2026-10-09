import 'server-only'

import { randomUUID } from 'node:crypto'

import { callerOf } from '@/lib/caller/caller'
import { isUniqueViolation } from '@/lib/db/unique-violation'
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
  COMMITTABLE_STATES,
  type DepositStateAction,
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

  async startDeposit({ deposit, unprovenTx }: StartDepositArgs): Promise<Deposit> {
    const now = new Date()
    const starting: Deposit = { ...deposit, createTime: now, updateTime: now }
    if (!COMMITTABLE_STATES.includes(starting.state)) {
      throw new Error(`${starting.name} cannot be started in state ${starting.state}`)
    }
    assertConsistent(starting)
    const stored = await this.depositRepository.create(starting)
    await this.publishEntered(stored)
    await this.commitCallerTransaction(stored, 'startDeposit', unprovenTx)
    return stored
  }

  async recordStarted({ name }: RecordStartedArgs): Promise<Deposit> {
    const started = await this.transition(name, 'recordStarted', {})
    const now = new Date()
    await this.commitChild(started, 'recordStarted', () =>
      this.vaultRequestStateController.queueRequest({
        request: {
          name: vaultRequestName(callerOf(name), randomUUID()),
          parent: name,
          action: 'deposit',
          state: 'AwaitingFlush',
          inIndex: started.inIndex,
          depositAccount: started.depositAccount,
          outIndex: null,
          requestId: null,
          signedTx: null,
          attestationBlockHeight: null,
          attestationOutputKind: null,
          attestationDigest: null,
          attestationSignature: null,
          attestationOutput: null,
          createTime: now,
          updateTime: now,
        },
      }),
    )
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
    await this.commitCallerTransaction(completing, 'completeDeposit', unprovenTx)
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
    await this.publishEntered(stored)
    return stored
  }

  /** The caller's wallet finalises the call, so the browser must act before the intent's TTL. */
  private commitCallerTransaction(
    deposit: Deposit,
    circuit: 'startDeposit' | 'completeDeposit',
    unprovenTx: string,
  ): Promise<void> {
    const now = new Date()
    return this.commitChild(deposit, circuit, () =>
      this.midnightTransactionStateController.commitTransaction({
        transaction: {
          name: midnightTransactionName(callerOf(deposit.name), randomUUID()),
          parent: deposit.name,
          state: 'AwaitingProof',
          circuit,
          signer: 'caller',
          unprovenTx,
          unboundTx: null,
          finalizedTx: null,
          expireTime: new Date(now.getTime() + CALLER_TRANSACTION_TTL_MS),
          txId: null,
          failure: null,
          error: null,
          createTime: now,
          updateTime: now,
        },
      }),
    )
  }

  /** The child's live index refusing the row means another actor committed a child first. */
  private async commitChild(
    deposit: Deposit,
    action: string,
    commit: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await commit()
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new DepositStateConflict(deposit.name, deposit.state, action)
      }
      throw error
    }
  }

  private publishEntered(deposit: Deposit): Promise<void> {
    return this.eventPublisher.publishEvent(
      DEPOSIT_EVENT_BY_STATE[deposit.state].create(deposit.name, { name: deposit.name }),
    )
  }
}

/** How long a caller's call stays submittable before the node refuses it. */
const CALLER_TRANSACTION_TTL_MS = 60 * 60 * 1000
