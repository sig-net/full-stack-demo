/** Does what a swap's current state needs, outside any transaction, then writes one transition. */
export interface SwapStateResolver {
  resolveSwap(args: ResolveSwapArgs): Promise<void>
  /** Re-reads every non-terminal swap, oldest first, for the sweep. */
  resolvePending(): Promise<void>
}

export interface ResolveSwapArgs {
  name: string
}
