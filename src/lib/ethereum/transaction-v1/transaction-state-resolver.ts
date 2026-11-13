/**
 * Does whatever a transaction's current state needs: broadcasting, watching or expiring. It is
 * the only place that knows which work is slow and where the write boundary falls, so it is
 * driven alike by a lifecycle event and by a sweep over waiting rows.
 */
export interface EthereumTransactionStateResolver {
  resolveTransaction(args: ResolveTransactionArgs): Promise<void>
  /** Every transaction in a non-terminal state, oldest first: the sweep that catches lost events and expiry. */
  resolvePending(): Promise<void>
}

export interface ResolveTransactionArgs {
  name: string
}
