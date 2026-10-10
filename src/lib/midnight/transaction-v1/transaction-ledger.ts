import type { MidnightTransactionFailure } from '@/lib/midnight/transaction-v1/transaction'

/**
 * The slow, external side of a transaction's life: the proof server, the node and the indexer.
 * Every call may take seconds or longer and is made outside any database transaction.
 */
export interface MidnightTransactionLedger {
  /** Proves the unproven transaction and resolves with the unbound (proven, unbalanced) bytes. */
  prove(unprovenTx: string): Promise<string>
  /**
   * Sends the finalized bytes to the node and resolves with their ledger id once they reached
   * it, an acknowledgement lost after the send included: the inclusion watch and the TTL then
   * decide. It throws only when the node refused the bytes with a reason or they never left.
   */
  submit(finalizedTx: string): Promise<string>
  /** Reads what the ledger has recorded for the id so far. */
  status(txId: string): Promise<MidnightLedgerTransactionStatus>
}

export type MidnightLedgerTransactionStatus =
  | { readonly outcome: 'pending' }
  | { readonly outcome: 'succeeded' }
  | {
      readonly outcome: 'failed'
      readonly failure: Extract<MidnightTransactionFailure, 'FailEntirely' | 'FailFallible'>
      readonly error: string
    }
