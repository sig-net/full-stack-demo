/**
 * Does whatever a deposit's current state needs: reads the children that do the step and
 * records the one the child's end shows. It dispatches on the row's state, so a lifecycle event
 * is only a nudge and the sweep can call the same resolution.
 */
export interface DepositStateResolver {
  resolveDeposit(args: ResolveDepositArgs): Promise<void>
  /** Every deposit in a non-terminal state: the sweep that catches lost events. */
  resolvePending(): Promise<void>
}

export interface ResolveDepositArgs {
  name: string
}
