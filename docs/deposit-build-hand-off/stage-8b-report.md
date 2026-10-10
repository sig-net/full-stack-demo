# Stage 8b report: the ledger acknowledges the user's transactions too

Worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
`bernard/rebuild`, tree left uncommitted. The user's diagramming files and the `## Diagrams`
section of `AGENTS.md` were not touched. No dependency was added.

## The classification and the SDK evidence for it

`MidnightTransactionLedger.submit` keeps its signature and changes its contract: it resolves
with the ledger id once the bytes reached the node, an acknowledgement lost after the send
included, and throws only when the node refused the bytes with a reason or they never left the
process. The resolver is unchanged in shape (a thrown submit records `Rejected`, a returned id
records the submission, the inclusion watch and the TTL decide the rest), so its tests did not
move.

What the SDK and polkadot do, read in `node_modules`:

- `@midnightntwrk/wallet-sdk-node-client@2.0.0-beta.2`, `dist/effect/PolkadotNodeClient.js`,
  `sendMidnightTransaction`: `api.tx.midnight.sendMnTransaction(hex).send(callback).catch(err =>
emit.fail(new SubmissionError({ message: 'Transaction submission failed', txData, cause: err })))`.
  Whatever rejected `send` becomes the `cause`. The stream disconnects the API in
  `Stream.ensuring` once the awaited stage is seen. Its seven error classes are in
  `NodeClientError.js`: `SubmissionError`, `ConnectionError` (from `ensureConnection`, nothing
  sent), `TransactionProgressError` (the stream ended without the awaited stage),
  `ParseError` (a status with an undecodable block number), `TransactionUsurpedError`,
  `TransactionDroppedError`, `TransactionInvalidError` (the node's own statuses after
  acceptance). All are `Data.TaggedError` classes and `instanceof Error`, which the unit test
  proves by constructing them.
- `@polkadot/api@16.5.6`, `promise/decorateMethod.js`, `decorateSubscribe`: the `send(callback)`
  promise resolves on the first status (`tap(() => tracker.resolve(...))`) and rejects on an
  observable error before it (`catchError(error => tracker.reject(error))`), and the tracker
  makes the two exclusive. So a `SubmissionError` always means the request errored before any
  status came back.
- `@polkadot/rpc-provider`, `coder/index.js` `checkError`: the node's JSON-RPC error becomes
  `new RpcError(`${code}: ${message}${formatErrorData(data)}`, code, data)`, and
  `coder/error.js` defines `RpcError extends Error` with `code` and `data` as non-enumerable own
  properties. `RpcError` is not exported by `@polkadot/api`'s module entry (only inside
  `bundle-polkadot-api.js`), so the implementation recognises it structurally: an `Error` whose
  `code` is a number.
- `@polkadot/rpc-provider`, `ws/index.js`: `#onSocketClose` rejects every pending handler with
  `new Error(`disconnected from ${endpoint}: ${code}:: ${reason || getWSErrorString(code)}`)`
  (the `1000:: Normal Closure` text of the stderr lines), and `#send` throws
  `new Error('WebSocket is not connected')` before writing when the socket is gone.
- `effect@3.22.2`, `internal/runtime.js`: `runPromise` rejects with a `FiberFailure` wrapping
  the cause, so the implementation runs the submission with `Effect.runPromiseExit` and reads
  the typed failure with `Cause.failureOption`, never parsing a thrown wrapper.

The classification, `submissionFailureKind(error: NodeClientError.NodeClientError)` in
`src/lib/midnight/transaction-v1/transaction-ledger-midnight-impl.ts`, returns one of three
kinds:

| Kind                  | When                                                                                                                                                                | `submit` does                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `refused`             | `SubmissionError` whose cause is an `RpcError` (numeric `code`) other than 1013, or `TransactionInvalidError`, `TransactionDroppedError`, `TransactionUsurpedError` | throws `The Midnight node refused the transaction` with the SDK error as `cause` |
| `held`                | `SubmissionError` whose cause is the `RpcError` `1013: Transaction Already Imported`: an earlier submission of the same bytes is in the pool                        | resolves silently, so the id is returned                                         |
| `unsent`              | `ConnectionError`, or `SubmissionError` whose cause is the exact `WebSocket is not connected`                                                                       | throws `The transaction never reached the Midnight node` with the cause          |
| `acknowledgementLost` | `SubmissionError` with a closure, a timeout, no cause or a cause of unknown shape, `TransactionProgressError`, `ParseError`                                         | `console.warn` with the cause chain and resolves, so the id is returned          |

A defect or interruption outside the error channel throws `The submission ended outside the
node client error channel` with `Cause.squash` as the cause. The default for an unknown cause
is deliberate: `Expired` at the TTL is the truthful record for an outcome nobody observed,
where `Rejected` would claim the node refused. The vault request resolver already re-reads the
ledger for its children, and the deposit resolver now does too, so a misclassified relayer or
caller transaction costs a delay, never a wrong terminal state on the parent.

`src/lib/message-of.ts` exports `messageOf(error)`, which walks the `cause` chain (guarded
against a cycle) and joins the messages with `: `. It replaced the two identical private copies
in the Midnight and Ethereum transaction resolvers, so a recorded `error` now reads, for a
refusal, `The Midnight node refused the transaction: Transaction submission failed: 1010:
Invalid Transaction: Custom error: 3`.

## The deposit resolver's branches

`DepositStateResolverImpl` takes a `RequestLedger` (the narrow port `VaultLedger` extends) as
its fifth constructor argument, wired from `ethereumErc20Vault.ledger` in
`src/server/backend.ts` (`createMidnightEthereumErc20VaultDepositV1` now receives
`{ circuits, ledger }`). The ledger is read lazily through `lazySingleton`, once per
`resolveDeposit` and once per `resolvePending` sweep, so a pass over deposits that need no
ledger makes no read and a pass over many makes one.

- `AwaitingStartTransaction`, child `Succeeded`: `recordStarted`, no ledger read (unchanged).
- `AwaitingStartTransaction`, child `Failed`: `requestStage(ledger, 'deposit', deposit.inIndex,
{ requestId: null })`. Any stage but `settled` means the start landed: `recordStarted`.
  `settled` means the slot was never queued, since a deposit still awaiting its start cannot
  have been completed: `recordStartFailure` with the child's message.
- `AwaitingCompletion`: a live `completeDeposit` child (non-terminal) leaves the row alone with
  no read. Otherwise the latest vault request row (an error when missing) and the ledger: stage
  `settled` records `recordCompleted` with `depositOutcome(request)`, any other stage does
  nothing. This catches a complete that landed under a lost acknowledgement or through another
  client within one sweep interval.
- `AwaitingCompleteTransaction`, child `Succeeded`: unchanged, outcome from the stored
  attestation.
- `AwaitingCompleteTransaction`, child `Failed`: the same ledger check, `recordCompleted` on
  `settled`, `recordCompleteFailure` otherwise.

The outcome derivation is the one `depositOutcome(request)` function the succeeded branch
already used (`executed` and output `01` is `minted`, anything else `closed`).

`AwaitingCompletion -> Completed` is a new row of the transition table in
`deposit-state-machine.ts` under the existing `recordCompleted` action, so the controller
gained no method and the event stays the one of the state entered. The state machine test's
"each action is legal from exactly one state" became "each action but `recordCompleted`",
with a test naming the two source states, and the controller test has a case applying
`recordCompleted` from `AwaitingCompletion`. Stage 9 should carry the arrow into the deposit
state diagram.

`requestLedgerAt(stage, lastSeen?)` was hoisted from the vault request resolver test into
`src/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures.ts` at its second consumer, with
the three constants it builds from, and that test imports it. `vault-ledger.test.ts` keeps its
own per-case views, since it tests `requestStage` itself over shapes the staged builder does not
produce.

## The end-to-end test

After `completeDeposit`, the polling loop (unchanged interval and timeout) treats a return to
`AwaitingCompletion` as a signal: it finds the newest `completeDeposit` child that ended
`Failed`, logs its `failure` and `error` once, and calls `completeDeposit` again, at most
`COMPLETE_RETRIES = 3` times, logging whether the adaptor accepted or refused the retry (a
settled request makes the circuit build fail its assert, which the adaptor reports as
`{ ok: false }`, and the resolver then completes the deposit on the sweep). After the retries
are used it keeps polling. The 23-event trail is asserted exactly when no attempt failed, and
with a failed attempt the prefix through the first `awaiting-completion` and the final
`['deposit', 'completed']` are asserted and the whole trail is logged.

Found while deleting the reproduction's rows: `event_outbox_entries_v1.data` is `bytea`, and
the `delete ... where data::text like '%<caller>%'` every integration test ran in `afterAll`
matched nothing (`data::text` renders hex: 0 rows matched against 36 for
`convert_from(data, 'UTF8') like`). The outbox had grown to 336 rows. The five files
(`ethereum-erc20-vault-request`, `ethereum-erc20-vault-deposit`, `ethereum-transaction-broadcast`,
`midnight-transaction-resolve`, `ethereum-erc20-vault-deposit-start`) now delete with
`convert_from(data, 'UTF8') like $1`.

## Verification, with the observed output

- `yarn format` then `yarn check`: typecheck clean (`✓ Types generated successfully`), `yarn
lint` exit 0 with no diagnostics printed (oxlint prints a diagnostic line when it has one: an
  earlier run printed `warning eslint(no-underscore-dangle)` on `error._tag`, which the
  `instanceof` chain replaced), format clean (`All matched files use the correct format`),
  `Boundaries hold across 223 files (212 backend imports checked)`, unit tests 29 files and
  571 tests passed (33 new: 6 in `message-of.test.ts`, 16 in the ledger test, 13 net in the
  deposit resolver test and state machine and controller tests, 573 after the `held` cases
  joined). The final run's figures are in the agent's summary.
- Live reproduction, no dev server (`ps aux | grep "[n]ext dev"` empty), run as
  `NODE_OPTIONS=--conditions=react-server node_modules/.bin/tsx --env-file=.env.local .scratch-spike/spike-8b-reproduction.mts`:

  ```text
  before: AwaitingCompletion outcome null
  ledger depositArgsMap holds inIndex: false
  Backend started: 5 consumers registered, sweep every 30000 ms
  Relayer wallet synced in 467 ms
  Sweep ran its first pass in 497 ms and runs every 30000 ms
  after 1010 ms: Completed outcome minted updateTime 2026-10-10T09:50:36.648Z
  outbox: midnight.ethereum-erc20-vault.deposit-v1.completed 2026-10-10T09:50:36.651Z
  ```

  psql afterwards: the deposit row `Completed | minted`, the four transaction rows unchanged
  (the complete still `Failed | Rejected | Transaction submission failed`: a resolver never
  rewrites a child). Then the caller's rows were deleted: `DELETE 4` from
  `midnight_transactions_v1`, `DELETE 1` from each of the other three resource tables, and
  `DELETE 36` from the outbox by `convert_from(data, 'UTF8')`. A recount returned 0.

- End-to-end run alone with the verbose reporter: see the next section.
- `yarn test:integration` as a whole: see the last section.

## End-to-end run

`yarn vitest run --config vitest.integration.config.ts --reporter=verbose integration-tests/ethereum-erc20-vault-deposit.test.ts`,
no dev server, nothing else loading the machine, started 11:51:14 local: `1 passed`, the test
271 460 ms, `Duration 274.81s`, exit 0. No complete attempt failed, so no retry ran and the
exact 23-event trail was asserted. The only stderr was the two `RPC-CORE: subscribeRuntimeVersion():
RuntimeVersion:: disconnected ... 1000:: Normal Closure` lines, and no `acknowledgement was
lost` warning was printed. The legs from the test's
timestamps (offsets from `startDeposit` at 09:51:18 UTC): `AwaitingVaultRequest` +34 s,
`AwaitingSend` +55 s, `AwaitingSignature` +95 s, `AwaitingBroadcast` +125 s,
`AwaitingAttestation` +155 s, `AwaitingAttestationQueue` +185 s, `AwaitingAttestationFlush`
+215 s, `Attested` and `AwaitingCompletion` +230 s, `completeDeposit` proven, balanced and
submitted +236 s, `Completed` as `minted` +271 s. The same shape as Stage 8's run 2 (one
`AwaitingAttestation` sweep wait).

## Second end-to-end run and the whole suite

After the `held` classification and the delayed retry, the end-to-end test ran alone again
(started 12:04:00 local): `1 passed`, the test 271 179 ms, `Duration 274.33s`, exit 0,
`AwaitingCompletion` at +230 s and `Completed` at +271 s, no failed attempt, no retry, no
warning, the same two `subscribeRuntimeVersion` closure lines.

`yarn test:integration` as a whole, run before those two fixes (started 11:56:02 local):
`1 failed | 19 passed`, `Duration 273.30s`, exit 1, the round trip ending at 251 s on
`Wallet.InsufficientFunds: could not balance dust` after a `1013: Transaction Already
Imported` refusal and an immediate retry (the findings log entry has the lines). Run again
after them (started 12:08:53 local): `Test Files 9 passed (9)`, `Tests 20 passed (20)`,
`Duration 263.99s`, exit 0. `event_outbox_entries_v1` held 326 rows before and after that
run, so the corrected cleanup removes what each file adds, and no deposit row was left.

Final `yarn format` then `yarn check` after every edit: the figures are in the summary the
agent returned, taken from that run.

## Where the pack was wrong, missing or ambiguous

- The pack's cause ("a `send` promise still pending when `Submitted` is seen rejects with the
  closure") does not match `decorateSubscribe`, which resolves `send` on the first status
  before the callback runs, so the SDK's own disconnect after `Submitted` cannot reject it. The
  first whole-suite run showed what the row had been hiding: the same complete bytes were
  submitted three times within a second (the event consumer on `awaiting-submission` and the
  sweep), the node accepted one and answered the others `1013: Transaction Already Imported`,
  and one of those refusals was written over the row before the submission was. The `Normal
Closure` stderr lines of a healthy run read `RPC-CORE: subscribeRuntimeVersion():
RuntimeVersion:: disconnected from ws://127.0.0.1:9944/: 1000:: Normal Closure` in both runs:
  they are the `ApiPromise`'s own runtime-version subscription cut by the per-submission
  disconnect, not the submission. The classification keeps the closure case as a lost
  acknowledgement all the same, and adds `held` for 1013.
- The task's retry ("call `completeDeposit` again" when the deposit returns to
  `AwaitingCompletion`) is harmful when fired at once: a second complete built while the first
  sits in the pool cannot be balanced (`Wallet.InsufficientFunds: could not balance dust`), and
  that is how the first suite run ended. The retry waits 40 s, past one sweep, so the ledger
  check completes the deposit first and a retry only runs for a request that is still open.
- The task said "record completed" from `AwaitingCompletion`, which the state machine did not
  allow. The transition was added under the existing action, see above.
- The integration tests' outbox cleanup never worked (the `bytea` cast), which no stage noticed
  because the trail assertion filters by key.
- `yarn lint` (plain `oxlint`) prints nothing when clean, so a "0 warnings" line cannot be
  quoted. The exit code is the evidence.

## What the Stage 9 agent must know

- `README.md` already carries this stage's behaviour: a paragraph under "Midnight transactions"
  on what `Rejected` means and the lost-acknowledgement path, the `AwaitingCompletion` row of
  the deposit state table, and a paragraph under the `deposit-state-resolver.ts` bullet on the
  ledger checks. The "Deposit lifecycle" section Stage 9 writes should state the rule once:
  the ledger is the acknowledgement for the caller's two calls too.
- The deposit state diagram lacks the `AwaitingCompletion -> Completed` arrow. The user's own
  diagramming work deleted `docs/deposit-state-diagram.drawio` from the tree while this stage
  ran, so the arrow goes wherever that diagram is being redrawn.
- `AGENTS.md`'s lifecycle section should name the rule that a resolver reads the ledger before
  believing a child's failure for every parent, the deposit included, and that `submit` on a
  ledger port resolves on a lost acknowledgement.
- New shared module: `src/lib/message-of.ts` (`messageOf`), isomorphic, used by both
  transaction resolvers and the Midnight ledger implementation.
- Exported from `transaction-ledger-midnight-impl.ts` for its unit test: `submitThrough`,
  `submissionFailureKind`, `SubmissionFailureKind`.
- The fixture `requestLedgerAt` lives in `vault-ledger-fixtures.ts` and imports the fixture ids
  from `vault-request-v1/vault-request-fixtures.ts`.
- `.scratch-spike/spike-8b-reproduction.mts` is the reproduction driver, gitignored.
