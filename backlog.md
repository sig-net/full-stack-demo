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

## Refuse a start call that claims another caller's live slot

`startDeposit`, `startWithdraw`, `startSupply`, `startRedeem`, `startSwap` and `startApproval` store the `inIndex` the browser sends without checking it
against the live rows, and the finalised bytes are not inspected at all. The backend keys its work on the stored slot, so a
caller that claims another user's live slot gets a vault request row that tracks the victim's
ledger entry: the relayer duplicates the victim's sends on its own DUST, and the liar's
operation is recorded `Completed` when the victim's settles. No funds move to the liar, since
the complete circuit checks the caller's commitment.

- [ ] Choose the fix: refuse an `inIndex` a live caller operation or vault request already holds
      (a search under the row lock, in the controller's create method), or sign the prepared
      assignment with a server secret and verify the signature at commit.
- [ ] Cover the refusal in the deposit and withdraw services' unit tests and in the deposit-start
      and withdraw integration files.

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

## Read the vault ledger before believing a caller call succeeded

The server records a caller's finalised bytes as the call the page names without inspecting
them, and `caller-operation-state-resolver-impl.ts` records `recordStarted` on a `Succeeded`
start child and `recordCompleted` on a `Succeeded` complete child from the child's outcome
alone, reading `requestStage` only when a child failed. Any finalised transaction the node
accepts, a self-transfer included, is therefore recorded as the step, the relayer sends and
attests a request the vault never opened, and the operation ends `Completed` while the vault
minted nothing.

- [ ] On a `Succeeded` start child, read the ledger (`requestStage()` over the vault ledger for
      the operation's action and `inIndex`) and record the start only when the request is
      there, else record the start failure with a message naming what the ledger showed.
- [ ] On a `Succeeded` complete child, route through `recordIfSettled()` so the completion is
      recorded only when the ledger shows the request settled.
- [ ] Decide whether a cheap circuit-identity check belongs at the adaptor (one call to the vault
      at the named circuit, read from the finalised bytes): if it does, it is its own named
      class with its own reason, never a reinstated sponsorship policy.
- [ ] Cover the ledger read in the caller operation resolver's unit tests with a mocked ledger
      (a succeeded child whose request the ledger lacks, a succeeded child the ledger settled),
      and the refusal in one integration file over real bytes.
- [ ] Rewrite the sentence in the six `<op>-service.ts` docs and the README's vault circuits
      paragraph ("the operation follows its child transaction's outcome") once the ledger is
      read for both outcomes.

## Bound the relayer's cost per caller start

A caller pays the DUST fee of its own two circuit calls, and nothing else: each start still
costs the relayer a send call, an attestation queueing call and a share of the flushes, and
costs the vault account the Ethereum gas of the sweep or transfer. A caller secret is free to
mint, so one client can start operations until the relayer's DUST or the vault account's ETH
runs out.

- [ ] Measure what one start of each operation costs the relayer in DUST and the vault account
      in ETH on the local stack, and record the figures in the README's readiness section.
- [ ] Choose the bound: a cap on live operations per caller (a search under the row lock in each
      controller's create method), a per-caller rate over a window, or a requirement that the
      caller's deposit account funds its own sweep, which the deposit already asks of it.
- [ ] Cover the refusal in each service's unit tests and in one integration file.

## Release the wallet's fee reservation when a finalised call never reaches the record

`runCallerCall()` releases the finalised bytes when the record refuses or throws, so the wallet's
DUST coin is free for the retry and the next call. A page closed between the wallet's finalise
and the server's record never releases, and the wallet holds the coins as pending until the
SDK's reservation lapses or the wallet reconnects.

- [ ] Measure on the local stack how long the seed wallet holds a finalised transaction it never
      submitted, and whether a reconnect of the same seed clears it.
- [ ] Decide whether the page should persist the finalised bytes beside the identity secret
      until the record answers, and release them on the next load when no row carries them.
- [ ] Walk the deposit's nonce-conflict retry through the browser pane (two tabs preparing the
      same deposit account) and confirm the second attempt finalises after the release.

## Set the caller's DUST minimum from a measured fee

`CALLER_DUST_MINIMUM` in `vault-readiness.ts` is 1 DUST, chosen as several times the local
chain's 0.05 DUST per-transaction overhead and not from the fee of a real caller call.

- [ ] Log the DUST the wallet's balance step spends per caller call (`durationMs` is logged, the
      fee is not) and measure it for the start and the complete of each operation.
- [ ] Set the minimum from the largest measured fee with a stated margin, and name the figure in
      the README's readiness section and the checklist's explanation.

## Walk every operation through the browser pane under the caller-paid flow

The deposit and the send are verified in the pane with the caller paying its fees. Supply,
redeem, swap and approval are verified by their integration round trips only, and the
"Paying the fee and signing with your wallet" stage label is verified by unit test only.

- [ ] Start and complete a supply and a redeem from the Lend panel, a swap from the Swap panel
      and an approval from the approval targets, with a fresh identity secret and the public
      genesis seed, and record what each stage line and toast read.
- [ ] Capture the signing stage label in a real browser, slowing the wallet's finalise if the
      pane samples too slowly to see it.
- [ ] Fix every label or toast that still describes the relayer paying.

## Cache the vault's prover keys in the browser

Every caller call fetches the circuit's prover key, verifier key and ZKIR from
`/zk-assets/ethereum-erc20-vault` through `FetchZkConfigProvider`, so a start and its complete
fetch the keys twice and a retry fetches them again.

- [ ] Wrap the page's zk config provider in a bounded cache keyed by circuit, verified against
      the asset's digest, under the specialist-cache rule in AGENTS.md.
- [ ] Measure the build time of a start before and after on the local stack and record it in
      the README's proving keys section.
