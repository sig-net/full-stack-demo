/** Does what an approval's current state needs, outside any transaction, then writes one transition. */
export interface ApprovalStateResolver {
  resolveApproval(args: ResolveApprovalArgs): Promise<void>
  /** Re-reads every non-terminal approval, oldest first, for the sweep. */
  resolvePending(): Promise<void>
}

export interface ResolveApprovalArgs {
  name: string
}
