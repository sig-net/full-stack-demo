/** Does what a withdrawal's current state needs, outside any transaction, then writes one transition. */
export interface WithdrawStateResolver {
  resolveWithdraw(args: ResolveWithdrawArgs): Promise<void>
  /** Re-reads every non-terminal withdrawal, oldest first, for the sweep. */
  resolvePending(): Promise<void>
}

export interface ResolveWithdrawArgs {
  name: string
}
