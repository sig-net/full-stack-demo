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

## Bound the relayer's DUST exposure to sponsored deposit calls

The relayer attaches its DUST fee to any bound bytes that pass the fee guard in
`src/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-impl.ts` (exactly one call to
the vault at the expected circuit, spending no coins). The guard bounds what the relayer pays
for, not how often: anyone can mint a caller secret and submit valid deposit calls, each costing
relayer DUST, and the fee of a call that fails in the fallible phase is not refunded.

- [ ] Decide the limit: a per-caller rate, a per-caller count of live deposits, or a deposit
      account that must hold funds before a start call is sponsored.
- [ ] Enforce it in `startDeposit` and `completeDeposit` before the controller call, with a
      refusal the adaptor reports as a result.
- [ ] Cover it in `src/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-impl.test.ts`
      and in `integration-tests/ethereum-erc20-vault-deposit-start.test.ts`.
- [ ] Apply the same limit to each operation as it moves to browser-side proving.

## Refuse a start call that claims another caller's live slot

`startDeposit` stores the `inIndex` the browser sends without checking it against the bound
bytes or the live rows. The backend keys its work on the stored slot, so a caller that claims
another user's live slot gets a vault request row that tracks the victim's ledger entry: the
relayer duplicates the victim's sends on its own DUST, and the liar's deposit is recorded
`Completed` when the victim's settles. No funds move to the liar, since the complete circuit
checks the caller's commitment.

- [ ] Choose the fix: refuse an `inIndex` a live caller operation or vault request already holds
      (a search under the row lock, in the controller's create method), or sign the prepared
      assignment with a server secret and verify the signature at commit.
- [ ] Cover the refusal in the deposit service's unit tests and in the deposit-start integration
      file.
- [ ] Carry the check into each operation's prepare and commit methods as it migrates.

## Pay a sponsored call's fee once when two resolvers race

`resolveAwaitingFee` in `src/lib/midnight/transaction-v1/transaction-state-resolver-impl.ts`
calls `RelayerWallet.payFee` outside the transaction and then writes `recordFee`. Two resolvers
on one `AwaitingFee` row (an event and a sweep, or two processes) both pay before one loses the
write with a `StateConflict`, so the relayer spends DUST twice for one call. The same
single-wallet concurrency leaves two in-flight fee transactions free to double spend the
relayer's DUST state.

- [ ] Serialise fee payments per row: claim the row before `payFee` (a lease field or a
      `search` with `lock: 'update'` and `skipLocked`), or run every relayer fee through one
      queue per process.
- [ ] Decide what the relayer wallet needs for fees in flight at once (a DUST UTXO per fee, or
      one payment at a time) and document it in the README's Midnight transactions section.
- [ ] Cover the race in `transaction-state-resolver-impl.test.ts` with two concurrent resolves of
      one row, asserting one `payFee` call.
