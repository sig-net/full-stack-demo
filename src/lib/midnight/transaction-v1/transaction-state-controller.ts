import { z } from 'zod'

import { defineEvent, type EventDefinition } from '@/lib/event/event'
import {
  type MidnightTransaction,
  midnightTransactionNameSchema,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'

/**
 * The only writer of a transaction's state. Each method is one transition from the state machine
 * in `transaction-state-machine.ts`: it refuses with `TransactionStateConflict` when the
 * transaction is not in a state the action applies to, and publishes the event of the state
 * entered. Methods open no transaction; the caller is the write boundary.
 */
export interface TransactionStateController {
  /** Stores a transaction the caller built: `AwaitingProof` with its unproven bytes, or `AwaitingWallet` with its proven bytes. */
  commitTransaction(args: CommitTransactionArgs): Promise<MidnightTransaction>
  /** `AwaitingProof` to `AwaitingWallet`. The unproven bytes are deleted. */
  recordProof(args: RecordProofArgs): Promise<MidnightTransaction>
  /** `AwaitingProof` to `Failed`. */
  recordProofFailure(args: RecordProofFailureArgs): Promise<MidnightTransaction>
  /** `AwaitingWallet` to `AwaitingSubmission`, with the bytes the wallet balanced and signed. */
  submitTransaction(args: SubmitTransactionArgs): Promise<MidnightTransaction>
  /** `AwaitingSubmission` to `AwaitingInclusion`, with the id the node returned. */
  recordSubmission(args: RecordSubmissionArgs): Promise<MidnightTransaction>
  /** `AwaitingSubmission` or `AwaitingInclusion` to `Failed`: the node or the ledger refused it. */
  recordRejection(args: RecordRejectionArgs): Promise<MidnightTransaction>
  /** `AwaitingInclusion` to `Succeeded`. */
  recordSuccess(args: RecordSuccessArgs): Promise<MidnightTransaction>
  /** Any waiting state to `Expired`, once `expireTime` has passed. */
  expireTransaction(args: ExpireTransactionArgs): Promise<MidnightTransaction>
}

export interface CommitTransactionArgs {
  transaction: MidnightTransaction
}

export interface RecordProofArgs {
  name: string
  unboundTx: string
}

export interface RecordProofFailureArgs {
  name: string
  error: string
}

export interface SubmitTransactionArgs {
  name: string
  finalizedTx: string
}

export interface RecordSubmissionArgs {
  name: string
  txId: string
}

export interface RecordRejectionArgs {
  name: string
  error: string
}

export interface RecordSuccessArgs {
  name: string
}

export interface ExpireTransactionArgs {
  name: string
}

/** The transaction is not in a state the action applies to, so another actor got there first. */
export class TransactionStateConflict extends Error {
  readonly name = 'TransactionStateConflict'

  constructor(transactionName: string, state: MidnightTransactionState, action: string) {
    super(`${transactionName} is ${state}, which does not allow ${action}`)
  }
}

export const transactionEventDataSchema = z.object({ name: midnightTransactionNameSchema })

export type TransactionEventData = z.infer<typeof transactionEventDataSchema>

/** One lifecycle event per state entered, keyed by the transaction name. */
export const TRANSACTION_EVENT_BY_STATE: Record<
  MidnightTransactionState,
  EventDefinition<TransactionEventData>
> = {
  AwaitingProof: defineEvent('midnight.transaction-v1.awaiting-proof', transactionEventDataSchema),
  AwaitingWallet: defineEvent(
    'midnight.transaction-v1.awaiting-wallet',
    transactionEventDataSchema,
  ),
  AwaitingSubmission: defineEvent(
    'midnight.transaction-v1.awaiting-submission',
    transactionEventDataSchema,
  ),
  AwaitingInclusion: defineEvent(
    'midnight.transaction-v1.awaiting-inclusion',
    transactionEventDataSchema,
  ),
  Succeeded: defineEvent('midnight.transaction-v1.succeeded', transactionEventDataSchema),
  Failed: defineEvent('midnight.transaction-v1.failed', transactionEventDataSchema),
  Expired: defineEvent('midnight.transaction-v1.expired', transactionEventDataSchema),
}

export const TRANSACTION_EVENTS: readonly EventDefinition<TransactionEventData>[] = Object.values(
  TRANSACTION_EVENT_BY_STATE,
)
