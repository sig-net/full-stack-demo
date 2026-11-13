/** Does what a redeem's current state needs, outside any transaction, then writes one transition. */
export interface RedeemStateResolver {
  resolveRedeem(args: ResolveRedeemArgs): Promise<void>
  /** Re-reads every non-terminal redeem, oldest first, for the sweep. */
  resolvePending(): Promise<void>
}

export interface ResolveRedeemArgs {
  name: string
}
