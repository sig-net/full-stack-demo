import 'server-only'

import type { EventPublisher } from '@/lib/event/event-publisher'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import {
  type CommitTransactionArgs,
  type ExpireTransactionArgs,
  type RecordProofArgs,
  type RecordProofFailureArgs,
  type RecordLedgerFailureArgs,
  type RecordRejectionArgs,
  type RecordSubmissionArgs,
  type RecordSuccessArgs,
  type SubmitTransactionArgs,
  MIDNIGHT_TRANSACTION_EVENT_BY_STATE,
  MidnightTransactionStateConflict,
  type MidnightTransactionStateController,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import {
  assertConsistent,
  INITIAL_STATE,
  nextState,
  type TransactionAction,
} from '@/lib/midnight/transaction-v1/transaction-state-machine'
import type { Logger } from '@/lib/logging/logger'

export class MidnightTransactionStateControllerImpl implements MidnightTransactionStateController {
  private readonly transactionRepository: MidnightTransactionRepository
  private readonly eventPublisher: EventPublisher
  private readonly logger: Logger

  constructor(
    transactionRepository: MidnightTransactionRepository,
    eventPublisher: EventPublisher,
    logger: Logger,
  ) {
    this.transactionRepository = transactionRepository
    this.eventPublisher = eventPublisher
    this.logger = logger
  }

  async commitTransaction(args: CommitTransactionArgs): Promise<MidnightTransaction> {
    const now = new Date()
    const stored = await this.transactionRepository.create({
      ...args,
      state: INITIAL_STATE,
      unboundTx: null,
      finalizedTx: null,
      txId: null,
      blockHeight: null,
      expireTime: new Date(now.getTime() + TRANSACTION_TTL_MS),
      failure: null,
      error: null,
      createTime: now,
      updateTime: now,
    })
    await this.eventPublisher.publishEvent(
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE[stored.state].create(stored.name, {
        name: stored.name,
        parent: stored.parent,
      }),
    )
    this.logger.info('resource created', {
      resource: stored.name,
      parent: stored.parent,
      toState: stored.state,
    })
    return stored
  }

  recordProof({ name, unboundTx }: RecordProofArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'recordProof', { unboundTx, unprovenTx: null })
  }

  recordProofFailure({ name, error }: RecordProofFailureArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'recordProofFailure', {
      failure: 'ProofFailed',
      error,
      unprovenTx: null,
    })
  }

  submitTransaction({ name, finalizedTx }: SubmitTransactionArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'submit', { finalizedTx })
  }

  recordSubmission({ name, txId }: RecordSubmissionArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'recordSubmission', { txId })
  }

  recordRejection({ name, error }: RecordRejectionArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'recordRejection', { failure: 'Rejected', error })
  }

  recordLedgerFailure({
    name,
    failure,
    error,
    blockHeight,
  }: RecordLedgerFailureArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'recordLedgerFailure', { failure, error, blockHeight })
  }

  recordSuccess({ name, blockHeight }: RecordSuccessArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'recordSuccess', { blockHeight })
  }

  expireTransaction({ name }: ExpireTransactionArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'expire', { failure: 'Expired', unprovenTx: null })
  }

  /** The row is read locked, so two actors applying actions at once are serialised and the second sees the state the first left. */
  private async transition(
    name: string,
    action: TransactionAction,
    patch: Partial<MidnightTransaction>,
  ): Promise<MidnightTransaction> {
    const [current] = await this.transactionRepository.search({
      criteria: [{ type: 'exact-text', field: 'name', text: name }],
      lock: 'update',
    })
    if (current === undefined) {
      throw new Error(`${name} does not exist`)
    }
    const state = nextState(current.state, action)
    if (state === undefined) {
      throw new MidnightTransactionStateConflict(name, current.state, action)
    }
    const next: MidnightTransaction = { ...current, ...patch, state, updateTime: new Date() }
    assertConsistent(next)
    const stored = await this.transactionRepository.update(next)
    await this.eventPublisher.publishEvent(
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE[stored.state].create(stored.name, {
        name: stored.name,
        parent: stored.parent,
      }),
    )
    this.logger.info('transition applied', {
      resource: stored.name,
      parent: stored.parent,
      action,
      fromState: current.state,
      toState: stored.state,
    })
    return stored
  }
}

/** How long a committed call stays submittable before the node refuses it. */
const TRANSACTION_TTL_MS = 60 * 60 * 1000
