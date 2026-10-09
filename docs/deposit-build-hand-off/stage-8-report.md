# Stage 8 report: the end-to-end deposit test

Worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
`bernard/rebuild`, nothing committed. Every check is green. The round trip passed on its first
run, on a second run without cleaning the chain, and inside the whole integration suite, and no
defect surfaced in the flush, send, signature poll, broadcast, attestation, queue or complete
paths, so no module under `src/lib` was changed by this stage.

## What was built

New files:

- `integration-tests/ethereum-erc20-vault-deposit.test.ts`: one test, `deposit from start to
Completed`, with a 40 minute timeout on the test and both hooks. `beforeAll` builds the backend,
  calls `start()`, builds an ethers `JsonRpcProvider` with `cacheTimeout: -1`, and starts and
  syncs the user wallet. The test starts a deposit of one USDC through the adaptor with a fresh
  32-byte caller secret, funds the deposit account on the fork (`anvil_setBalance` one ETH, then
  the USDC balance slot found by the sentinel probe ported from the prep repository's
  `fork-funding.ts` and written with `anvil_setStorageAt`, read back), and loops every 5 s:
  `playWallet` (lists the deposit's transactions through the transaction adaptor, balances every
  `AwaitingWallet` caller row once through the user wallet and hands the finalized bytes to
  `submitTransaction`), then a `Trail` observation that logs every state change of the deposit,
  its vault request and every child transaction with a timestamp, until the deposit is
  `AwaitingCompletion`. It then calls `completeDeposit` through the adaptor, loops the same way
  to `Completed`, and asserts: `outcome` is `minted`, the vault request is `Attested` with
  `attestationOutputKind` `executed`, `depositArgsMap.member(inIndex)` is false on the live
  ledger, the newest Ethereum transaction under the request is `Succeeded`, and the 23-event
  trail of the deposit, its start transaction, its vault request and its complete transaction
  is in publication order (entries matched by event key, ordered by `createdAt`, a millisecond
  tie broken parent first). `afterAll` deletes the caller's rows from the four resource tables
  and the outbox, stops the user wallet, stops the backend, then ends the pool.
- `.scratch-spike/spike-ledger-open.mts` (the sizes of the six vault maps and the two counters)
  and `.scratch-spike/spike-wallet-dust.mts` (DUST and shielded balances of the relayer and user
  seeds through a synced facade). Gitignored probes, kept for Stage 9.

Changed files:

- `integration-tests/user-wallet.ts`: gained `UserWallet` (`publicKeys`, `balance(unboundTx)`,
  `stop()`) and `startUserWallet(seedHex, config)`, built from the SDK packages as
  `seed-wallet-facade.ts` builds the application's facade (same cost parameters, in-memory
  history storage, `shielded`, `unshielded` and `dust` starters, the node URL as `ws` for
  `relayURL`), without the custom submission service since the backend submits.
  `userWalletPublicKeys` and `userWalletSeed` stay, now over a shared `deriveRoleKeys`.
- `README.md`: a "Running the end-to-end deposit" subsection under Testing with the command,
  what the stack must have, and the duration.
- `docs/deposit-build-plan.md`: the Stage 8 section rewritten to what is built, its five boxes
  ticked after their runs, and findings appended with the legs of each run, the ledger and
  balance probes, and the timing of the hub path.

## Verification, with the observed output

- `yarn typecheck`: "Types generated successfully", no error. `yarn lint`: no diagnostics.
  `yarn format` then `yarn format:check`: "All matched files use the correct format. Finished in
  304ms on 243 files". `yarn boundaries`: "Boundaries hold across 221 files (208 backend imports
  checked)". `yarn test`: 28 files, 538 tests passed. `yarn check`: exit 0.
- Run 1, `yarn vitest run --config vitest.integration.config.ts --reporter=verbose
integration-tests/ethereum-erc20-vault-deposit.test.ts` with `ps aux | grep "[n]ext dev"`
  finding nothing: `Backend started: 5 consumers registered, sweep every 30000 ms`, `user wallet
synced in 762 ms`, `Relayer wallet synced in 812 ms`, `Sweep ran its first pass in 812 ms`, the
  trail below, `✓ ... deposit from start to Completed 241037ms`, `Test Files 1 passed`, `Duration
244.11s`, exit 0. The only stderr was two `RPC-CORE: subscribeRuntimeVersion(): RuntimeVersion::
disconnected from ws://127.0.0.1:9944/: 1000:: Normal Closure` lines (polkadot, on a
  submission's connection closing). No `failed` or `Error` line from the backend.
- Run 2, same command, without cleaning the chain: `✓ ... 271173ms`, `Duration 274.25s`, exit 0,
  the same two stderr lines. One extra sweep interval in `AwaitingAttestation` (see the timeline).
- Run 3, `yarn test:integration --reporter=verbose` as a whole: 9 files, 20 tests passed, `Duration 293.10s`,
  exit 0, no failed test, the round trip inside it `271009ms`. This run verified the 23-event trail
  assertion (added after run 2), so the plan's trail box is ticked on it.
- Ledger after each run (`spike-ledger-open.mts`): `inputRequestBuffer 0n`, `outputRequestBuffer
0n`, `depositArgsMap 0n`, `evictionMap 0n`, `inputAttestationBuffer 0n`,
  `outputAttestationBuffer 0n`, `vaultAccountNonce 0n`, `globalLastSeen` 11983035n after run 1
  and 11983311n after run 2. No open request was left behind.
- Balances (`spike-wallet-dust.mts`): the user's shielded balance of the vault token
  `96a2a81c6c63...` was `1000000` after run 1 and `2000000` after run 2, the two mints. The
  relayer's DUST read 83 758.58 before run 2 and 83 792.83 after it: generation outpaces the
  four relayer transactions of a deposit on this stack, so the fee cost is not readable as a
  balance difference.
- Rows: `select count(*) from midnight_ethereum_erc20_vault_deposits_v1 where name like
'callers/8e221a77%'` returned 0 after run 1, so `afterAll` deleted the caller's rows.

## The full run's timeline (run 1, offsets from `startDeposit`)

| Offset | Observation                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------- |
| 0.0 s  | `startDeposit` built and stored in 552 ms (`AwaitingStartTransaction`)                         |
| 3.3 s  | deposit account funded on the fork (balance-slot probe plus the writes)                        |
| 3.9 s  | start call proven, balanced by the user wallet in 608 ms and submitted (`AwaitingSubmission`)  |
| 9 s    | start call `AwaitingInclusion`                                                                 |
| 34 s   | start `Succeeded`, deposit `AwaitingVaultRequest`, request `AwaitingFlush`                     |
| 54 s   | flush landed (relayer `flushQueue`), request `AwaitingSend`, `sendDeposit` `AwaitingProof`     |
| 59 s   | `sendDeposit` `AwaitingInclusion`                                                              |
| 94 s   | `sendDeposit` `Succeeded`, request `AwaitingSignature` (a sweep read the ledger)               |
| 124 s  | MPC signature read, request `AwaitingBroadcast`, sweep transaction `AwaitingInclusion` (sweep) |
| 154 s  | sweep transaction `Succeeded`, request `AwaitingAttestationQueue`, `queueAttestation1` proving |
| 159 s  | `queueAttestation1` `AwaitingInclusion`                                                        |
| 184 s  | `queueAttestation1` `Succeeded`, request `AwaitingAttestationFlush`                            |
| 200 s  | second flush landed, request `Attested`, deposit `AwaitingCompletion`                          |
| 200 s  | `completeDeposit` built and stored (`AwaitingCompleteTransaction`, call `AwaitingProof`)       |
| 205 s  | complete call proven, balanced in 433 ms and submitted                                         |
| 210 s  | complete call `AwaitingInclusion`                                                              |
| 241 s  | complete call `Succeeded`, deposit `Completed` as `minted`                                     |

Run 2 matched run 1 leg for leg except that the MPC's attestation was not yet posted when the
`awaiting-attestation` event nudged the resolver, so `AwaitingAttestation` lasted until the next
sweep (30 s) and the whole took 271 s. The three legs that only a sweep advances
(`AwaitingSignature`, `AwaitingBroadcast` through the Ethereum resolver's inclusion check, and
`AwaitingAttestation`) each cost up to one 30 s interval, as the design says.

## Where the pack was wrong, missing or ambiguous

- The task file and the plan both expected defects in the paths no earlier stage ran. None
  appeared: the two runs and the suite run passed without a backend error line. The three-run
  budget for diagnosis was not needed.
- The plan's Stage 8 sketch (`user.balanceTx(deserialiseUnbound(...))`, `bytesToHex`, a
  `getDeposit()` helper, an `afterAll` without `stop()`) differed from the task file (a started
  facade with `balance(unbound)`, `stop()` in `afterAll` before `pool.end()`). I followed the task
  file and rewrote the plan's sketch to what is built.
- The task file's trail assertion (the deposit's five events) is narrower than the plan's box
  (the deposit, its start transaction, its vault request and its complete transaction). I asserted
  the plan's 23-event trail. To do that in strict order I had to find out that outbox entries carry
  a JavaScript `new Date()` with millisecond resolution and tie-break by name, so a parent's event
  and its child's first event published in one unit of work can tie: the test breaks a tie parent
  first, which is the publication order of every `start*`, `recordStarted` and `completeDeposit`.
  Entries are matched by the event's `key` (the resource name), not by substring of the data, so
  the children under the vault request (whose `parent` is the request) stay out of the trail.
- The task file says `deserialise its unboundTx (ledger markers 'signature', 'proof',
'pre-binding')`, which is right, and the hex is bare (no `0x`), which it does not say: the
  relayer's `finalize` and the ledger's `prove` both use `Buffer.from(hex, 'hex')` on bare hex,
  and `submitTransactionArgsSchema` takes `hexBytesSchema`.
- The pack's "What to expect" says a flush takes "a minute or more" and the Stage 7 report says
  a flush that proves takes minutes. On this stack a flush that moves one item took 15 to 20 s
  from the `awaiting-flush` event to `AwaitingSend`, and a relayer proof 5 to 10 s. The 30 s
  sweep interval, not proving, dominates the round trip.
- The pack does not say how to read the user's minted balance. `facade.waitForSyncedState()`
  returns a `FacadeState` whose `shielded.balances` maps token id to amount and whose
  `dust.balance(date)` gives DUST, which `spike-wallet-dust.mts` reads.
- The pack says DUST shortage would show as repeated `Failed` relayer transactions. The relayer
  held about 83 758 DUST and its balance rose during a run, so that failure mode is far away on
  this stack.
- `hookTimeout`: the task said "a matching hookTimeout if the set-up needs it". The user wallet
  synced in under a second, but `afterAll` runs `backend.stop()`, which may wait 30 s on a flush
  mid-run, so both hooks got the 40 minute bound rather than the config's 120 s.

## Decisions that deviate from the plan, and why

- The trail is asserted as `[actor, state]` pairs over four actors (`deposit`, `start`,
  `request`, `complete`) rather than raw event type strings, so the expectation reads as the
  lifecycle it checks. The actor comes from the event key through the rows' names.
- The test reads the deposit's state through the repository for the `waitFor` condition and the
  final assertions, and through the adaptors for everything the browser would do (start, list,
  submit, complete). The plan's sketch used a `getDeposit()` through the adaptor, which would
  only add the caller check the start already exercised.
- `fundDepositAccount` probes slots 0..63 with both the Solidity and Vyper layouts as the prep
  repository's helper does, and reads the balance with `provider.call` plus `toBigInt` rather than
  an ethers `Contract`, since `getFunction()(...)` returns `any` and lint refuses the assertion.
- The user's minted balance is not asserted in the test (the plan's sketch left it as a comment).
  It was read by the spike instead (1000000 then 2000000), since the facade's state subscription
  is not needed by the test and the token id is only known after the first mint.

## What the Stage 9 agent (documentation and the invalidated-name grep) must know

- Behaviour that differs from the README's current description:
  - README "The relayer wallet": "a sync can take minutes". Observed: the relayer synced in 812 ms
    and 868 ms (`Relayer wallet synced in N ms`), the user wallet in 762 ms and 872 ms, on this
    stack's short chain. The sentence describes a long chain, which the README could say.
  - README "Flushing the vault queue": "a flush that takes minutes to prove and land". Observed:
    15 to 20 s from the `awaiting-flush` event to `AwaitingSend`, twice per deposit.
  - README "Proving keys": "the first build takes minutes". Not exercised: the keys were already
    built under `zk-assets/`. The relayer proofs (`sendDeposit`, `queueAttestation1`) and the
    user's (`startDeposit`, `completeDeposit`) each took under 10 s through the proof server.
  - README "Start-up and the sweep" and "Events": the 30 s sweep is the pacing item of a deposit:
    three legs wait on it, so a round trip is about four minutes of which roughly 90 s is
    sweep waiting. Worth one sentence where the sweep interval is documented.
  - README "ERC-20 vault deposit API": nothing observed contradicts it. The complete step's
    `outcome` `minted` and the `01` attestation output were seen as the design says.
- The invalidated-name grep: `grep -rn -E "\bStarting\b|AwaitingEVM|resolveDepositState|
unsignedTx|startEventConsumerHub|startOutboxEntryProcessor|sweepForever" README.md docs/*.md
AGENTS.md src integration-tests` (excluding the plan) finds only the English word in
  `integration-tests/ethereum-erc20-vault-deposit-start.test.ts`'s describe name, which is not a
  state. The plan's Stage 9 list names `docs/architecture.drawio` and
  `docs/deposit-state-diagram.drawio`. Both exist, beside the user's uncommitted
  `backend-components.*`, `transaction-state-machine.*`, `diagram-palette.*` and
  `architecture-old.drawio`, which this stage did not open.
- `AGENTS.md`'s list of backend-owned files still lacks `flusher.ts`, `sweep.ts` and
  `delay-unless-aborted.ts` (the file holds the user's uncommitted `## Diagrams` section, so no
  stage edited it). The guard's `BACKEND_FILES` in `scripts/check-boundaries.ts` has all three.
- Durations and costs of a full deposit on this stack: 241 s and 271 s end to end (the
  difference is one sweep interval), six proofs (two of the user's, four of the relayer's:
  `flushQueue` twice, `sendDeposit`, `queueAttestation1`), one EVM transaction (the sweep,
  `gasLimit` 100 000 at 30 gwei max on a fork whose base fee is a few wei), one ETH and one USDC
  dealt to the deposit account per run by cheatcode. The relayer's DUST cost is below its
  generation over a run (balance 83 758.58 before, 83 792.83 after), so it could not be measured
  as a difference. The ledger is left clean after each run (every map `0n`), so repeated runs do
  not accumulate open requests as the task file feared. A run that fails mid-way would.
- The verbose reporter is the only way to see the trail: the default reporter hides stdout.
  `yarn test:integration` as a whole runs the round trip too, so the suite now takes about five
  minutes instead of twenty seconds.
- The two `RPC-CORE ... Normal Closure` stderr lines per run come from `@polkadot/api` when the
  ledger's per-submission connection closes (`submitToNode` in
  `transaction-ledger-midnight-impl.ts`). They are noise, not a failure.
