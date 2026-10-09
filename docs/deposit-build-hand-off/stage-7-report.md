# Stage 7 report: composition, start-up, stop and the sweep

Worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
`bernard/rebuild`, tree left uncommitted. No dependency was added. The dev server was started
through the preview tool for the boot check and stopped afterwards (`ps aux | grep "[n]ext dev"`
finds nothing at the end).

## What was built

New files:

- `src/lib/delay-unless-aborted.ts`: `delayUnlessAborted(ms, signal)`, a delay that resolves at
  once on abort and holds no timer past either. Shared by the three loops below.
- `src/lib/sweep.ts`: `sweep(tasks, intervalMs, signal)` over `SweepTask { name, run }`. Runs the
  tasks in order, logs `Sweep task <name> failed` and goes on, ends a pass after the running task
  when the signal aborts, waits the interval, and logs its first pass's duration once.
- `src/lib/sweep.test.ts`: four table cases plus one (failure logged and next task runs, abort
  mid-pass, abort during the interval ends at once, abort from the last task, aborted signal runs
  nothing).
- `integration-tests/backend-lifecycle.test.ts`: `start()` twice is one promise, the relayer
  wallet syncs, the sweep's first pass logs, the relay holds a pool client, `stop()` releases it,
  a second `stop()` resolves, the file exits on its own.

Changed files:

- `src/server/backend.ts`: `Backend` gained `start()` and `stop()` with their contract in the
  interface doc. `createLifecycle(packages)` builds them: `start` is a `lazySingleton` that starts
  the relayer wallet (the sync-time logging moved here from `start.ts`), registers the five
  consumers, and runs the hub loop, the outbox relay and the sweep under one `AbortController`.
  `stop` aborts, waits up to `STOP_TIMEOUT_MS` (30 s) through `endWithin` (which holds no timer
  past the race), then closes the Kafka producer. `KafkaBackend` gained `producer` so `stop()` can
  close it. `SWEEP_INTERVAL_MS` is 30 s and the task order is the Midnight transaction, Ethereum
  transaction, vault request and deposit resolvers, then `flush`.
- `src/server/start.ts`: `startBackend()` is `await (await getBackend()).start()`.
- `src/lib/event/event-consumer-hub-impl.ts`: `startEventConsumerHub` became
  `runEventConsumerHub(hub, createConsumer, signal): Promise<void>`. The abort closes the consumer
  (`close(true)` ends the stream), the loop breaks before committing a record handled at the
  abort, and the restart loop ends on abort without logging.
- `src/lib/event/outbox-entry-v1/outbox-entry-processor-impl.ts`: `startOutboxEntryProcessor`
  became `runOutboxEntryProcessor(processor, pool, signal): Promise<void>`. The `LISTEN` client is
  released on abort and the relay in flight is awaited before the loop resolves.
- `src/lib/midnight/transaction-v1/transaction-state-resolver{,-impl,-impl.test}.ts` and the
  Ethereum twins: `resolvePending()` on both interfaces and impls (each non-terminal state in
  `*_STATES` order, oldest first, one row's failure logged, through the same private `resolve`
  that `resolveTransaction` uses, so expiry runs first for swept rows), with a four-case table
  per resolver.
- `src/lib/midnight/ethereum-erc20-vault/flush-event-consumer{,.test}.ts`: the handler calls
  `flusher.flush().catch(log)` and returns. Tests: the handler returns before the flush ends, a
  failed flush is logged and the handler still resolved.
- `scripts/check-boundaries.ts`: `src/lib/delay-unless-aborted.ts` and `src/lib/sweep.ts` joined
  `BACKEND_FILES`.
- `README.md`: a "Start-up and the sweep" subsection under Composition, and the Kafka, Events,
  Midnight transactions, relayer wallet, Ethereum transactions and Flushing passages updated for
  the renamed loops, the detached flush and `resolvePending()`.
- `docs/deposit-build-plan.md`: Stage 7 rewritten to what is built (sketch corrected, boxes
  ticked after their verification), the Stage 5 backpressure box and hub finding annotated as
  superseded, seven findings appended.

## Verification, with the observed output

- `yarn typecheck`: "Types generated successfully", exit 0 (the four `TS6133` errors the pack
  describes as pre-existing are gone: the Stage 6 agent removed the placeholders).
- `yarn lint`: exit 0, no diagnostics printed.
- `yarn format` then `yarn format:check`: "All matched files use the correct format. Finished in
  281ms on 242 files". The formatter rewrapped one plan line whose inline code span crossed a line
  break, which I rewrapped by hand so the check settles.
- `yarn boundaries`: "Boundaries hold across 220 files (208 backend imports checked)" (219 before
  the lifecycle test file existed). Planted `src/lib/planted-violation.ts` importing `sweep` and
  `delayUnlessAborted` at runtime: exit 1 with
  `src/lib/planted-violation.ts: imports @/lib/sweep, but a backend module is only used inside the backend and src/server`
  and the same for `@/lib/delay-unless-aborted`; after `rm`, "Boundaries hold across 219 files
  (208 backend imports checked)", exit 0.
- `yarn test`: 28 files, 538 tests passed (524 before, 14 new), 1.66 s.
- `yarn check`: green end to end, exit 0 (typecheck, lint, format:check, boundaries, test).
- `yarn vitest run --config vitest.integration.config.ts --reporter=verbose integration-tests/backend-lifecycle.test.ts`
  with `ps aux | grep "[n]ext dev"` finding nothing: stdout `Backend started: 5 consumers
registered, sweep every 30000 ms`, `relayer wallet synced 432 ms after start`, `Relayer wallet
synced in 433 ms`, `Sweep ran its first pass in 479 ms and runs every 30000 ms`, `backend stopped
in 2474 ms`; test 3161 ms, file 5.35 s, exit 0, no stderr block and no close timeout, so no
  open handle survived `stop()` plus `pool.end()`. The relayer wallet was left running by
  `stop()` (no stop exists on `RelayerWallet`) and did not keep the process alive.
- `yarn test:integration` with no dev server running: 8 files, 19 tests, 19.37 s, exit 0.
- Dev server through the preview tool (`preview_start` name `next-dev`), logs in order: `Ready in
257ms`, `Backend started: 5 consumers registered, sweep every 30000 ms`, `Relayer wallet synced
in 1129 ms`, `Sweep ran its first pass in 1227 ms and runs every 30000 ms`. No error line over
  more than a minute of running (so the later passes failed on nothing). The one warning is
  Node's `DEP0169` `url.parse()` deprecation from a dependency, present before this stage.
  `preview_stop` stopped the server.
- Side observation: the local outbox held 119 unsent entries left by earlier test runs
  (`select sent, count(*) from event_outbox_entries_v1 group by sent`: 119 false, 27 true). The
  lifecycle test's relay sent them all (146 true, 0 false afterwards) and the hub consumed the
  stale events without a logged error, which is the redelivery path exercised for real.

## Where the pack was wrong, missing or ambiguous

- The pack says `yarn typecheck` reports four pre-existing `TS6133` errors and `yarn lint` two
  errors in `deposit-state-controller-impl.ts`. Both are clean now, and the Stage 6 report's
  counts say so. `yarn check` runs end to end.
- The pack's command list lacks the single-file integration invocation's verbose reporter, which
  is needed to see a test's `console.log` output: `--reporter=verbose`. The default reporter
  hides stdout.
- `02-stage-task.md` names "the Kafka consumer, the outbox listener's dedicated connection and its
  sweep timer, the sweep loop" as what `stop()` closes. The Kafka producer was missing: the relay
  connects it on the first send, and the lifecycle test relays for real, so `stop()` closes it
  too (`KafkaBackend.producer`). Not in the list either: the relayer wallet, which has no stop and
  was observed not to keep the process alive.
- The pack does not say that a manual `record.commit()` after the consumer closed never settles
  in `@platformatic/kafka` (`kAutocommit` returns early while the consumer is inactive and the
  waiter stays queued). I read `messages-stream.js` to find it. The loop breaks before the commit
  when aborted.
- `01-codebase-context.md` says the controller tests check locks and the resolver tests count
  `runInTransaction` calls, which is right, but the deposit resolver's `resolvePending` test is the
  closer model for a sweep test (a `searching(rowsByState)` double recording the states searched)
  than the vault request resolver's, which also counts ledger reads. I copied the deposit shape.
- The plan's Stage 7 sketch named `midnight.relayer: { wallet, caller }`, `zkConfigProvider`,
  `proofProvider`, `compiledContract`, `providers`, `readers`, `outcomeSource` and
  `ethereum.ledger` at the top level. None of those are on the object: the plan now shows what is.

## Decisions that deviate from the plan, and why

- The sweep is a generic `src/lib/sweep.ts` over `{ name, run }` tasks, not a `sweepForever`
  inside `backend.ts`, so it has a unit test of its own and the composition root only names the
  tasks. It is backend-owned in the boundary guard like `lazy-singleton.ts`.
- The flush is awaited inside the sweep pass, as the plan sketched. A flush of minutes therefore
  delays the next pass, and events still nudge resolvers through the hub meanwhile. Recorded in the
  findings as the trade-off it is.
- The flush consumer detaches the flush (`void`-style `catch(log)`), reversing Stage 5. The sweep
  makes this safe, as the task file argued. The Stage 5 box and finding carry a superseded note
  rather than a rewrite, since the findings log is a log.
- `stop()` bounds its wait at 30 s and logs `The backend loops are still running after 30000 ms`
  when the bound passes, then goes on to close the producer (a close during a send is caught and
  logged). The task said "with a bound" without a number.
- The sweep logs its first pass once (`Sweep ran its first pass in N ms and runs every M ms`) so
  a boot log proves the sweep alive without a line every 30 s. The task's dev-server check asked
  to read "the sweep's first pass" from the logs, which needed something observable.
- The hub loop leaves a record handled at the abort uncommitted (redelivered on the next start,
  which idempotent handlers absorb) because a commit after the consumer closed never settles.
- `AGENTS.md`'s list of backend-owned files was not edited (it holds the user's uncommitted
  `## Diagrams` section), so it still lacks `flusher.ts`, `sweep.ts` and
  `delay-unless-aborted.ts`. Noted in the findings, as Stage 5 did.

## What the Stage 8 agent (the end-to-end deposit test) must know

- Start and stop from a test: `backend = await testBackend()`, `await backend.start()` in
  `beforeAll`, and in `afterAll` delete the caller's rows, `await backend.stop()`, then
  `await backend.db.pool.end()` in that order. `stop()` before `pool.end()` matters: the relay
  holds a pool client until the abort, and `pool.end()` waits for it.
- `start()` resolves at once (the loops are running, the wallet is still syncing). It need not be
  awaited before an adaptor call: `startDeposit` needs no start at all (Stage 6's test proves
  without one), and only a relayer transaction's finalisation and the first flush wait on the
  wallet sync. On this stack the wallet syncs about 430 ms after `start()` in a test and about
  1.1 s in the dev server, and the sweep's first pass (which includes a cold flush) ends within
  about 500 ms in a test.
- The sweep interval is 30 s. A deposit's chain of steps advances on events through the hub
  within a second or two of each transition, but the two polling states of a vault request
  (`AwaitingSignature`, `AwaitingAttestation`) and any lost event advance only on a sweep, so a
  wait in the test should allow at least one interval per such step, and a flush that the sweep
  runs delays the next pass by the flush's duration (minutes when it proves). `waitFor` loops
  with a 5 s polling interval and a generous overall timeout (the plan's sketch) fit this.
- `stop()` waits up to 30 s for a resolve or flush mid-run. A test that stops while a flush is
  proving will see `The backend loops are still running after 30000 ms` and the run finishes
  detached, which is fine for teardown but means `pool.end()` may then wait on that run's
  transaction. Prefer to stop after the deposit completed.
- The hub shares the Kafka group `full-stack-demo.events` with the dev server: never run both.
  Stale unsent outbox entries from other test files are relayed by whichever backend runs the
  relay first, and the hub handles their events as no-ops (the named rows are gone).
- Log lines to look for in a test's verbose output: `Backend started: 5 consumers registered,
sweep every 30000 ms`, `Relayer wallet synced in N ms`, `Sweep ran its first pass in N ms and
runs every 30000 ms`, and on failures `Sweep task <name> failed`, `Resolving Midnight
transaction <name> failed`, `Resolving Ethereum transaction <name> failed`, `Flush nudged by
<type> <id> failed`.
- Dev server boot: ready in about 260 ms, the backend starts from instrumentation before the
  first request is served, the first `HEAD /` took 884 ms, and the wallet sync and sweep's first
  pass were both done about 1.3 s after `Backend started`. The server runs the same `start()` as
  the test, so a test cannot run while it is up.
