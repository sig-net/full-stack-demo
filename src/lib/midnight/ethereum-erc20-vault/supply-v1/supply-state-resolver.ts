/** Does what a supply's current state needs, outside any transaction, then writes one transition. */
export interface SupplyStateResolver {
  resolveSupply(args: ResolveSupplyArgs): Promise<void>
  /** Re-reads every non-terminal supply, oldest first, for the sweep. */
  resolvePending(): Promise<void>
}

export interface ResolveSupplyArgs {
  name: string
}
