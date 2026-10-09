import { z } from 'zod'

import { defineEvent, type EventDefinition } from '@/lib/event/event'
import {
  type MidnightTransaction,
  type MidnightTransactionFailure,
  midnightTransactionNameSchema,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'

/**
 * The only writer of a transaction's state. Each method is one transition from the state machine
 * in `transaction-state-machine.ts`: it refuses with `MidnightTransactionStateConflict` when the
 * transaction is not in a state the action applies to, and publishes the event of the state
 * entered. Methods open no transaction: the caller is the write boundary.
 */
export interface MidnightTransactionStateController {
  /** Stores a transaction the caller built: `AwaitingProof` with its unproven bytes, or `AwaitingWallet` with its proven bytes. */
  commitTransaction(args: CommitTransactionArgs): Promise<MidnightTransaction>
  /** `AwaitingProof` to `AwaitingWallet`. The unproven bytes are deleted. */
  recordProof(args: RecordProofArgs): Promise<MidnightTransaction>
  /** `AwaitingProof` to `Failed` as `ProofFailed`. */
  recordProofFailure(args: RecordProofFailureArgs): Promise<MidnightTransaction>
  /** `AwaitingWallet` to `AwaitingSubmission`, with the bytes the wallet balanced and signed. */
  submitTransaction(args: SubmitTransactionArgs): Promise<MidnightTransaction>
  /** `AwaitingSubmission` to `AwaitingInclusion`, with the id the node returned. */
  recordSubmission(args: RecordSubmissionArgs): Promise<MidnightTransaction>
  /** `AwaitingSubmission` or `AwaitingInclusion` to `Failed` with the node's or the ledger's verdict. */
  recordRejection(args: RecordRejectionArgs): Promise<MidnightTransaction>
  /** `AwaitingInclusion` to `Succeeded`. */
  recordSuccess(args: RecordSuccessArgs): Promise<MidnightTransaction>
  /**
   * Any waiting state to `Failed` as `Expired`, once `expireTime` has passed. A rejection and an
   * expiry racing on one row are serialised by the row lock, and the first to land is the reason
   * recorded.
   */
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
  failure: Extract<MidnightTransactionFailure, 'Rejected' | 'FailEntirely' | 'FailFallible'>
  error: string
}

export interface RecordSuccessArgs {
  name: string
}

export interface ExpireTransactionArgs {
  name: string
}

/** The transaction is not in a state the action applies to, so another actor got there first. */
export class MidnightTransactionStateConflict extends Error {
  readonly name = 'MidnightTransactionStateConflict'

  constructor(transactionName: string, state: MidnightTransactionState, action: string) {
    super(`${transactionName} is ${state}, which does not allow ${action}`)
  }
}

/** The parent is carried so that the parent's consumer can match on it without a read. */
export const midnightTransactionEventDataSchema = z.object({
  name: midnightTransactionNameSchema,
  parent: z.string().min(1),
})

export type MidnightTransactionEventData = z.infer<typeof midnightTransactionEventDataSchema>

/** One lifecycle event per state entered, keyed by the transaction name. */
export const MIDNIGHT_TRANSACTION_EVENT_BY_STATE: Record<
  MidnightTransactionState,
  EventDefinition<MidnightTransactionEventData>
> = {
  AwaitingProof: defineEvent(
    'midnight.transaction-v1.awaiting-proof',
    midnightTransactionEventDataSchema,
  ),
  AwaitingWallet: defineEvent(
    'midnight.transaction-v1.awaiting-wallet',
    midnightTransactionEventDataSchema,
  ),
  AwaitingSubmission: defineEvent(
    'midnight.transaction-v1.awaiting-submission',
    midnightTransactionEventDataSchema,
  ),
  AwaitingInclusion: defineEvent(
    'midnight.transaction-v1.awaiting-inclusion',
    midnightTransactionEventDataSchema,
  ),
  Succeeded: defineEvent('midnight.transaction-v1.succeeded', midnightTransactionEventDataSchema),
  Failed: defineEvent('midnight.transaction-v1.failed', midnightTransactionEventDataSchema),
}

export const MIDNIGHT_TRANSACTION_EVENTS: readonly EventDefinition<MidnightTransactionEventData>[] =
  Object.values(MIDNIGHT_TRANSACTION_EVENT_BY_STATE)
