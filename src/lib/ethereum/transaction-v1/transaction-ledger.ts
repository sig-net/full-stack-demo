/**
 * The slow, external side of a transaction's life: the EVM node behind the RPC endpoint. Every
 * call may take seconds and is made outside any database transaction.
 */
export interface EthereumTransactionLedger {
  /**
   * Sends the signed bytes and resolves with their hash. A transaction the node already knows or
   * has mined resolves normally, since the same bytes can only ever mine once. Any other refusal
   * throws.
   */
  broadcast(signedTx: string): Promise<string>
  /** What the chain shows for the hash, given the sender and nonce the signed bytes carry. */
  status(args: LedgerStatusArgs): Promise<EthereumLedgerTransactionStatus>
}

export interface LedgerStatusArgs {
  txHash: string
  from: string
  nonce: number
}

/**
 * `nonceConsumed` means the sender's nonce advanced past the transaction's without a receipt for
 * it, so another transaction took its slot and this one can never mine.
 */
export type EthereumLedgerTransactionStatus =
  | { readonly outcome: 'pending' }
  | { readonly outcome: 'mined'; readonly blockNumber: bigint }
  | { readonly outcome: 'reverted'; readonly blockNumber: bigint }
  | { readonly outcome: 'nonceConsumed' }
