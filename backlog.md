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

## Bound the relayer's DUST exposure to sponsored caller calls

The relayer attaches its DUST fee to any bound bytes that pass the sponsored call guard in
`src/lib/midnight/ethereum-erc20-vault/sponsored-call-guard.ts` (exactly one call to the vault
at the expected circuit, no unshielded offer, no DUST action, and shielded coins spent only where
`SPONSORED_CALL_POLICY_BY_CIRCUIT` admits them). The guard bounds what the relayer pays for, not
how often: anyone can mint a caller secret and submit valid calls of any operation, each costing relayer DUST, and the fee of a call that fails in the fallible phase is not refunded.

A `startWithdraw` call surrenders a coin the caller's wallet funds, so its bound bytes carry
shielded inputs and change by design. The shielded offer is opaque to the inspector, so the
guard cannot tell the coin the circuit needs from extra shielded movement a caller bundles
beside it (a transfer to a third party, or many inputs that enlarge the bytes): the relayer
pays the DUST fee of whatever shielded movement rides on a `startWithdraw`. The same holds for
every other start circuit that takes a coin (`startSupply`, `startRedeem`, `startSwap`).

- [ ] Decide the limit: a per-caller rate, a per-caller count of live operations, or a deposit
      account that must hold funds before a start call is sponsored.
- [ ] Enforce it in the start and complete methods of the deposit and withdraw services before
      the controller call, with a refusal the adaptor reports as a result.
- [ ] Cover it in the deposit and withdraw services' unit tests and in
      `integration-tests/ethereum-erc20-vault-deposit-start.test.ts` and
      `integration-tests/ethereum-erc20-vault-withdraw.test.ts`.
- [ ] Bound the shielded movement a sponsored `startWithdraw` may carry (a ceiling on the
      inputs and outputs the inspector counts, or a fee estimate the relayer refuses to exceed),
      once a size the wallet's balancing never exceeds is known.
- [ ] Apply the same limit to each operation as it moves to browser-side proving.

## Refuse a start call that claims another caller's live slot

`startDeposit`, `startWithdraw`, `startSupply`, `startRedeem`, `startSwap` and `startApproval` store the `inIndex` the browser sends without checking it
against the bound bytes or the live rows. The backend keys its work on the stored slot, so a
caller that claims another user's live slot gets a vault request row that tracks the victim's
ledger entry: the relayer duplicates the victim's sends on its own DUST, and the liar's
operation is recorded `Completed` when the victim's settles. No funds move to the liar, since
the complete circuit checks the caller's commitment.

- [ ] Choose the fix: refuse an `inIndex` a live caller operation or vault request already holds
      (a search under the row lock, in the controller's create method), or sign the prepared
      assignment with a server secret and verify the signature at commit.
- [ ] Cover the refusal in the deposit and withdraw services' unit tests and in the deposit-start
      and withdraw integration files.
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

## Back off a rejected Ethereum broadcast

Seen on 2026-10-20 after the fork was re-created: the vault account held no ETH and chain nonce
0 while the MPC signed the transfer at the vault contract's nonce 8, so every broadcast was
rejected ("Insufficient funds for gas * price + value") and the resolver replaced the child at
once, 2,244 Ethereum transaction rows in ten minutes.

- [ ] Give a rejected broadcast a retry delay that grows per attempt, and a cap after which the
      vault request records the failure for a person to look at.
- [ ] Record the rejection reason on the replaced child so the row explains the loop.
- [ ] Cover it in the Ethereum transaction resolver's unit tests and in a vault request test
      that drives a rejected broadcast.
- [ ] Document in the README's stack section that a re-created fork leaves the vault account
      unfunded with nonce 0 while the vault contract's counter continues, and the cheatcodes
      that realign them (`anvil_setBalance`, `anvil_setNonce`, `anvil_dropAllTransactions`).
