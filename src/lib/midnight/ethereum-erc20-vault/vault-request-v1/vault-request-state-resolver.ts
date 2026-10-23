/**
 * Does whatever a vault request's current state needs: reads the vault ledger and the
 * singleton's posts, records a step the ledger shows done, or commits the one child that does
 * the step when no live child does. It dispatches on the row's state, so a lifecycle event is
 * only a nudge and the sweeps below can call the same resolution.
 */
export interface VaultRequestStateResolver {
  resolveVaultRequest(args: ResolveVaultRequestArgs): Promise<void>
  /** Every request waiting for a flush, re-read after a flush landed and on the sweep. */
  resolveWaitingFlushes(): Promise<void>
  /** Every request in a non-terminal state: the sweep that catches lost events and the MPC's posts. */
  resolvePending(): Promise<void>
}

export interface ResolveVaultRequestArgs {
  name: string
}
