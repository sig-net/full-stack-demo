import 'server-only'

import type { EventPublisher } from '@/lib/event/event-publisher'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import {
  type CommitTransactionArgs,
  type ExpireTransactionArgs,
  type RecordProofArgs,
  type RecordProofFailureArgs,
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
  COMMITTABLE_STATES,
  nextState,
  type TransactionAction,
} from '@/lib/midnight/transaction-v1/transaction-state-machine'

export class MidnightTransactionStateControllerImpl implements MidnightTransactionStateController {
  private readonly transactionRepository: MidnightTransactionRepository
  private readonly eventPublisher: EventPublisher

  constructor(
    transactionRepository: MidnightTransactionRepository,
    eventPublisher: EventPublisher,
  ) {
    this.transactionRepository = transactionRepository
    this.eventPublisher = eventPublisher
  }

  async commitTransaction(args: CommitTransactionArgs): Promise<MidnightTransaction> {
    const now = new Date()
    const transaction: MidnightTransaction = {
      ...args.transaction,
      createTime: now,
      updateTime: now,
    }
    if (!COMMITTABLE_STATES.includes(transaction.state)) {
      throw new Error(`${transaction.name} cannot be committed in state ${transaction.state}`)
    }
    assertConsistent(transaction)
    const stored = await this.transactionRepository.create(transaction)
    await this.publishEntered(stored)
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

  recordRejection({ name, failure, error }: RecordRejectionArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'recordRejection', { failure, error })
  }

  recordSuccess({ name }: RecordSuccessArgs): Promise<MidnightTransaction> {
    return this.transition(name, 'recordSuccess', {})
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
    await this.publishEntered(stored)
    return stored
  }

  private publishEntered(transaction: MidnightTransaction): Promise<void> {
    return this.eventPublisher.publishEvent(
      MIDNIGHT_TRANSACTION_EVENT_BY_STATE[transaction.state].create(transaction.name, {
        name: transaction.name,
        parent: transaction.parent,
      }),
    )
  }
}
