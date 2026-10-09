import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'

/** Drives a transaction through its states. Callers hand it validated values, so it never parses. */
export interface TransactionStateController {
  /**
   * Stores a transaction the caller has built, in `Proving` with its unproven bytes or in
   * `Signing & Balancing` with its proven bytes, and announces it so a resolver takes it onward.
   */
  commitTransaction(args: CommitTransactionArgs): Promise<MidnightTransaction>
}

export interface CommitTransactionArgs {
  transaction: MidnightTransaction
}
