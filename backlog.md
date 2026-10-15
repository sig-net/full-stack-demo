# Backlog

Follow-up work agreed but not started. Each item is a checklist a session can pick up whole.

## Show a failed trade as a refund, not as a stuck or successful operation

Seen on 2026-10-15: a swap started without the router's allowance reverted on Ethereum, the
MPC attested it as failed, and the completion refunded the surrendered vault coin. The
mechanism worked, the presentation did not.

- [ ] While the vault request waits for its attestation flush after the Ethereum transaction
      failed, `activityStepsOf()` (`src/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress.ts`)
      marks the current step as failed and the two completion steps as pending, so the dialog
      reads as stopped for the seconds before the swap moves to `AwaitingCompletion`. Mark the
      executed step ("Tokens traded on Ethereum") as failed and the steps after it as the refund
      path, from the moment the foreign chain transaction is `Failed`.
- [ ] The dialog's text in `src/components/activity-flow-dialog.tsx` says "Nothing for you to do
      now. Your wallet will need to approve once more." for a failed trade. Say what happened and
      what the signature does: "The trade failed on Ethereum. The completion returns your 6 USDC
      coin to your wallet; sign it when it is proved."
- [ ] The activity view carries each operation's `outcome` (`swapped` or `refunded`, and the
      same pair for a send, a supply and a redeem), but `src/lib/activity/activity-entries.ts`
      maps only the state to a status, so a refunded swap ends as Complete with the same
      description as a successful one. Present the refunded outcome on the row (a badge or the
      description) and in the dialog's title and summary.
- [ ] Name the cause where it is known: the Ethereum transaction's `failure` (`Reverted`,
      `NonceConsumed`) and, for a revert, the reason read back from the node by replaying the
      transaction at its parent block, as `eth_call` returns it (`STF` for a missing allowance).
- [ ] The vault request resolver's error line "attestation at or below the entry lastSeen, nonce
      reused at start" names the one cause its author foresaw. A forked dev chain restarted at a
      lower height produced it on 2026-10-15. Say what was observed and leave the cause to the
      reader.
- [ ] Cover the presentation with table-driven tests over `activityEntryOf()` and
      `activityStepsOf()` for a refunded swap, a refunded send and a reverted trade still
      awaiting its attestation flush.
