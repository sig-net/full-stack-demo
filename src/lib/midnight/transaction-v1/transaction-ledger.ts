import type { MidnightTransactionFailure } from '@/lib/midnight/transaction-v1/transaction'

/**
 * The slow, external side of a transaction's life: the proof server, the node and the indexer.
 * Every call may take seconds or longer and is made outside any database transaction.
 */
export interface TransactionLedger {
  /** Proves the unproven transaction and resolves with the unbound (proven, unbalanced) bytes. */
  prove(unprovenTx: string): Promise<string>
  /** Sends the finalized bytes to the node and resolves with the id it accepted them under. */
  submit(finalizedTx: string): Promise<string>
  /** Reads what the ledger has recorded for the id so far. */
  status(txId: string): Promise<LedgerTransactionStatus>
}

export type LedgerTransactionStatus =
  | { readonly outcome: 'pending' }
  | { readonly outcome: 'succeeded' }
  | {
      readonly outcome: 'failed'
      readonly failure: Extract<MidnightTransactionFailure, 'FailEntirely' | 'FailFallible'>
      readonly error: string
    }
