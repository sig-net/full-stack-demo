import { z } from 'zod'

import {
  type EthereumTransaction,
  type EthereumTransactionFailure,
  ethereumTransactionNameSchema,
  type EthereumTransactionState,
} from '@/lib/ethereum/transaction-v1/transaction'
import { defineEvent, type EventDefinition } from '@/lib/event/event'

/**
 * The only writer of a transaction's state. Each method is one transition from the state machine
 * in `transaction-state-machine.ts`: it refuses with `EthereumTransactionStateConflict` when the
 * transaction is not in a state the action applies to, and publishes the event of the state
 * entered. Methods open no transaction: the caller is the write boundary.
 */
export interface EthereumTransactionStateController {
  /** Stores a signed transaction the caller built, in `AwaitingSubmission`. */
  commitTransaction(args: CommitTransactionArgs): Promise<EthereumTransaction>
  /** `AwaitingSubmission` to `AwaitingInclusion`, with the hash the node accepted the bytes under. */
  recordSubmission(args: RecordSubmissionArgs): Promise<EthereumTransaction>
  /** `AwaitingInclusion` to `Succeeded`, with the block that included the transaction. */
  recordSuccess(args: RecordSuccessArgs): Promise<EthereumTransaction>
  /** `AwaitingSubmission` or `AwaitingInclusion` to `Failed` with the node's or the chain's verdict. */
  recordFailure(args: RecordFailureArgs): Promise<EthereumTransaction>
  /**
   * Either waiting state to `Failed` as `Expired`, once `expireTime` has passed. A failure and an
   * expiry racing on one row are serialised by the row lock, and the first to land is the reason
   * recorded.
   */
  expireTransaction(args: ExpireTransactionArgs): Promise<EthereumTransaction>
}

export interface CommitTransactionArgs {
  transaction: EthereumTransaction
}

export interface RecordSubmissionArgs {
  name: string
  txHash: string
}

export interface RecordSuccessArgs {
  name: string
  blockNumber: bigint
}

export interface RecordFailureArgs {
  name: string
  failure: Extract<EthereumTransactionFailure, 'Rejected' | 'Reverted' | 'NonceConsumed'>
  /** The node's message, where the failure came with one. */
  error?: string
  /** The block that included the transaction, for a `Reverted` failure. */
  blockNumber?: bigint
}

export interface ExpireTransactionArgs {
  name: string
}

/** The transaction is not in a state the action applies to, so another actor got there first. */
export class EthereumTransactionStateConflict extends Error {
  readonly name = 'EthereumTransactionStateConflict'

  constructor(transactionName: string, state: EthereumTransactionState, action: string) {
    super(`${transactionName} is ${state}, which does not allow ${action}`)
  }
}

/** The parent is carried so that the parent's consumer can match on it without a read. */
export const ethereumTransactionEventDataSchema = z.object({
  name: ethereumTransactionNameSchema,
  parent: z.string().min(1),
})

export type EthereumTransactionEventData = z.infer<typeof ethereumTransactionEventDataSchema>

/** One lifecycle event per state entered, keyed by the transaction name. */
export const ETHEREUM_TRANSACTION_EVENT_BY_STATE: Record<
  EthereumTransactionState,
  EventDefinition<EthereumTransactionEventData>
> = {
  AwaitingSubmission: defineEvent(
    'ethereum.transaction-v1.awaiting-submission',
    ethereumTransactionEventDataSchema,
  ),
  AwaitingInclusion: defineEvent(
    'ethereum.transaction-v1.awaiting-inclusion',
    ethereumTransactionEventDataSchema,
  ),
  Succeeded: defineEvent('ethereum.transaction-v1.succeeded', ethereumTransactionEventDataSchema),
  Failed: defineEvent('ethereum.transaction-v1.failed', ethereumTransactionEventDataSchema),
}

export const ETHEREUM_TRANSACTION_EVENTS: readonly EventDefinition<EthereumTransactionEventData>[] =
  Object.values(ETHEREUM_TRANSACTION_EVENT_BY_STATE)
