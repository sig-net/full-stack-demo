/**
 * Does whatever a transaction's current state needs: proving, submitting, watching or expiring.
 * It is the only place that knows which work is slow and where the write boundary falls, so
 * it is driven alike by a lifecycle event and by a sweep over waiting rows.
 */
export interface MidnightTransactionStateResolver {
  resolveTransaction(args: ResolveTransactionArgs): Promise<void>
}

export interface ResolveTransactionArgs {
  name: string
}
