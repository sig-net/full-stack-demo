import 'server-only'

import { newEvent } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import {
  MIDNIGHT_TRANSACTION_CREATED_EVENT,
  type MidnightTransaction,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type {
  CommitTransactionArgs,
  TransactionStateController,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'

export class TransactionStateControllerImpl implements TransactionStateController {
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
    assertCommittable(transaction)
    const stored = await this.transactionRepository.create(transaction)
    await this.eventPublisher.publishEvent(
      newEvent(MIDNIGHT_TRANSACTION_CREATED_EVENT, stored.name, { name: stored.name }),
    )
    return stored
  }
}

/** The fields that carry a value in each state a transaction may be committed in. */
type CommittableState = Extract<MidnightTransactionState, 'Proving' | 'Signing & Balancing'>
type StepField = 'unprovenTx' | 'unboundTx' | 'finalizedTx' | 'expireTime' | 'txId' | 'error'

const FIELDS_SET_ON_COMMIT: Record<CommittableState, readonly StepField[]> = {
  // The TTL is fixed when the unproven transaction is built, so it is known from the start.
  Proving: ['unprovenTx', 'expireTime'],
  'Signing & Balancing': ['unboundTx', 'expireTime'],
}

const STEP_FIELDS: readonly StepField[] = [
  'unprovenTx',
  'unboundTx',
  'finalizedTx',
  'expireTime',
  'txId',
  'error',
]

/**
 * A committed transaction carries exactly the fields its entry state produced. The bytes
 * themselves are trusted: the caller built them, and the resolver that consumes them is the
 * first thing that can tell whether they are well formed.
 */
function assertCommittable(transaction: MidnightTransaction): void {
  if (!isCommittableState(transaction.state)) {
    throw new Error(`${transaction.name} cannot be committed in state ${transaction.state}`)
  }
  const expected = FIELDS_SET_ON_COMMIT[transaction.state]
  for (const field of STEP_FIELDS) {
    const set = transaction[field] !== null
    if (set !== expected.includes(field)) {
      throw new Error(
        `${transaction.name} in state ${transaction.state} must have ${field} ${set ? 'unset' : 'set'}`,
      )
    }
  }
}

function isCommittableState(state: MidnightTransactionState): state is CommittableState {
  return state in FIELDS_SET_ON_COMMIT
}
