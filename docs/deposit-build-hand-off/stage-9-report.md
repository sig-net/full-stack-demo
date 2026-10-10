# Stage 9 report: documentation, the rules file and the invalidated-name grep

Worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
`bernard/rebuild`, tree left uncommitted. No behaviour changed, no dependency was added, nothing
was installed. The user's diagramming work (every `.drawio` and `.png` under `docs/`,
`docs/diagramming.md`, `docs/diagram-assets/`, `docs/diagram-library.*`,
`scripts/diagram-library.ts`, `drawio.config.json`, the diagram scripts in `package.json` and
the `## Diagrams` section at the end of `AGENTS.md`) was not touched: `git diff AGENTS.md` shows
only additions above that section, and `yarn diagram-library:check` reported
`docs/diagram-library.drawio matches the code` on every run, so `yarn diagram-library` never
had to run.

## What changed

- `README.md`: a new "Deposit lifecycle" section between Events and Midnight transactions (the
  four resources and the flush with their names, the actor of each step in order, the
  ledger-as-acknowledgement rule, the parent nudge, the two user actions and what the browser
  supplies, the sweep and why it is load-bearing, the unreachable stale attestation). The
  Testing section rewritten into unit, integration and end-to-end subsections with a table of
  the nine integration files, their needs and what they cover, every command and the observed
  durations. The Scripts table gained `yarn diagram-library`, `yarn diagram-library:check` and
  `yarn zk-assets`, and `yarn check` now lists the diagram library check. The Layout table
  gained `src/lib/caller`, `src/lib/midnight`, `src/lib/midnight/wallet`, `deposit-v1`,
  `integration-tests`, `scripts`, `zk-assets` and `docs`, and the `src/lib` row names its root
  files. Database: the write-boundary list names a resolver's transition in place of a
  consumer's handler, and the repository `lock` values are both described. Events: the rule on
  an event's data shape. Midnight and Ethereum transactions: the submit-time rejection and the
  ledger's verdict as two actions (`recordRejection` only from `AwaitingSubmission`,
  `recordLedgerFailure` or `recordFailure` only from `AwaitingInclusion`). Durations the local
  stack observed in place of "minutes": the relayer sync (a second or two), a flush (15 to 20 s
  from the nudge to the request's next state), a proof (five to ten seconds), the round trip
  (four to four and a half minutes, roughly 90 s of it sweep waiting). Proving keys no longer
  claims a first-build duration nobody measured and says instead that a rerun over built bundles
  finishes in seconds, which this stage observed. The deposit API section says that
  `docs/architecture.md` keeps the design's names and maps them.
- `AGENTS.md`: the lifecycle section gained seven bullets (the parent nudge, the
  ledger-as-acknowledgement rule, the ledger port's `submit` contract with the rejection split,
  the flush as a process with no row, the `signer` rule, the sweep, the event-shape rule), the
  service methods section one (a write that follows a slow build opens the transaction in the
  service, the adaptor wraps nothing), the boundary bullet now lists exactly what
  `scripts/check-boundaries.ts` lists (the five directories, the six files, the eleven
  suffixes), the validation section gained the drizzle-kit rule, and the verification section
  the end-to-end test bullet. The section `## Diagrams` is byte for byte as it was.
- `docs/architecture.md`: the opening says it is the design record the backend was built from,
  a new "What was built from it" section maps the design's names (`midnight_transaction_jobs`,
  the job states, `Transaction.State`, `Deposit.State`, `activeTransaction`, the create methods,
  the workers, the compose proof server) to the code's, and the "Mapping onto this repository"
  table names the built locations (server actions, one table per resource, the consumers,
  `VaultCircuitsMidnightJsImpl`, the stack's proof server, `RelayerWalletSeedImpl`) and marks
  the browser wallet and the UI as not built.
- `.env.example`: two comment lines lost a prose semicolon. The variable set was already
  complete: every name the schemas in `src/lib/config/*.ts` read (`DB_CONNECTION_STRING`,
  `KAFKA_BROKERS`, `MIDNIGHT_ZK_ASSETS_ROOT`, `MIDNIGHT_RELAYER_SEED`, `RESPOND_OUTPUT_SOURCE`,
  `MPC_OUTPUT_CACHE_URL`, the five `MIDNIGHT_NETWORK_ID` and URL variables, the three contract
  variables, `EVM_CHAIN_ID`, `EVM_RPC_URL`) plus `MIDNIGHT_USER_SEED`, which only
  `integration-tests/user-wallet.ts` reads, and nothing else. `src/instrumentation.ts` reads
  `NEXT_RUNTIME`, which Next.js sets and no one configures.
- `docs/deposit-build-plan.md`: the "Resume here" section says every stage is done and lists
  what is left for the user, the Stage 9 section is rewritten with its boxes ticked (the
  diagram box left open as the user's), and four findings entries dated 2026-10-10 hold the
  closing counts, the grep, the diagram labels and the comment fixes.
- Seven code comments lost a prose semicolon, no behaviour change:
  `src/components/contexts/MidnightWalletContext.tsx`,
  `src/lib/midnight/transaction-v1/transaction.ts`,
  `src/lib/config/midnight-network-config.ts`, `src/lib/config/midnight-signet-config.ts`,
  `src/lib/config/ethereum-config.ts`,
  `src/lib/config/midnight-ethereum-erc20-vault-config.ts`, `integration-tests/setup.ts`.
- This report.

## Verification, with the observed output

- `yarn format` then `yarn check`, after the final edit: `✓ Types generated successfully`,
  oxlint printed nothing and exited 0, `All matched files use the correct format` (257 files),
  `Boundaries hold across 223 files (212 backend imports checked)`,
  `docs/diagram-library.drawio matches the code`, `Test Files 29 passed (29)`,
  `Tests 583 passed (583)`, `Duration 1.92s`, exit 0. The rerun after the last edit printed the
  same lines over 258 files (this report included), 583 tests in 1.89 s, exit 0, and a third
  run followed the two edits to this report.
- `yarn test:integration --reporter=verbose`, started 12:28 local with `pgrep -fl "next dev"`
  empty and the comment edits already made (nothing under `src` changed afterwards):
  `Test Files 9 passed (9)`, `Tests 20 passed (20)`, `Duration 265.23s`, exit 0. The round trip
  `241232ms`: `user wallet synced in 1497 ms`, `Relayer wallet synced in 1557 ms`,
  `Sweep ran its first pass in 1560 ms`, `started ... in 554 ms`, start call balanced and
  submitted in 617 ms, `AwaitingVaultRequest` +34 s, `AwaitingFlush` +34 s, `AwaitingSend`
  +49 s (the flush landed in 15.1 s), `sendDeposit` proven and submitted within 10 s,
  `AwaitingSignature` +94 s, `AwaitingBroadcast` +124 s, sweep `Succeeded` and
  `AwaitingAttestationQueue` +155 s, `queueAttestation1` proven and submitted within 5 s,
  `AwaitingAttestationFlush` +185 s, `Attested` and `AwaitingCompletion` +200 s
  (`AwaitingCompletion reached 200377 ms after the start`, the second flush in 15.0 s), the
  complete call balanced and submitted in 471 ms at +205 s, `Completed 241187 ms after the
start` with outcome `minted`. The only stderr was the two
  `RPC-CORE: subscribeRuntimeVersion(): RuntimeVersion:: disconnected from ws://127.0.0.1:9944/: 1000:: Normal Closure`
  lines, no backend error line, no `acknowledgement was lost` warning, no retry.
- The README's single-file command, run verbatim afterwards
  (`yarn vitest run --config vitest.integration.config.ts --reporter=verbose integration-tests/ethereum-erc20-vault-deposit.test.ts`):
  started 12:37:57 local, nothing else running: `Test Files 1 passed (1)`, `Tests 1 passed (1)`,
  the test `251220ms`, `Duration 254.87s`, exit 0, `Relayer wallet synced in 1160 ms`,
  `user wallet synced in 1164 ms`, `AwaitingCompletion reached 205376 ms after the start`,
  `Completed 251152 ms after the start`, no retry, no warning, the same two
  `subscribeRuntimeVersion ... Normal Closure` lines. One sweep wait longer than the suite's
  run, as Stage 8's run 2 and 8b's runs were: the MPC's post was not yet there when the event
  nudged the resolver, so that leg waited for the next sweep.
- The README's other quoted commands, each run verbatim in this stage: `yarn install`
  (`Done in 0s 824ms`), `docker compose up -d --wait` (both containers `Healthy`),
  `yarn db:migrate` (`migrations applied successfully`, nothing pending), `yarn zk-assets`
  (`vault: up to date (88 files verify against the shipped manifest), skipped`,
  `signet: up to date (10 files verify against its manifest), skipped`, 3 s wall clock),
  `yarn db:generate --name describe_the_change` (`No schema changes, nothing to migrate`,
  `git status drizzle` empty), `yarn test` and `yarn boundaries` inside `yarn check`,
  `yarn test:integration` above. `yarn dev`, run after the integration runs had ended and
  stopped after one request: `✓ Ready in 268ms`, `Backend started: 5 consumers registered,
sweep every 30000 ms`, `Sweep ran its first pass in 712 ms`, `Relayer wallet synced in 754 ms`,
  `GET / 200 in 676ms`, and `curl` of `http://localhost:3000` answered 200. It also logged
  `✓ Generated AGENTS.md for AI agents. Set agentRules: false in next.config to disable.` and
  appended a ten-line `<!-- BEGIN:nextjs-agent-rules -->` block after the user's `## Diagrams`
  section. I removed those lines again (`sed '356,365d'`), so `AGENTS.md` ends with the user's
  section as before and `git diff AGENTS.md` shows only this stage's additions above it. Every
  `yarn dev` will append the block again until `agentRules: false` is set in `next.config.ts`,
  which is a code change for the user to decide on.
- Not run, since each would change this environment rather than observe it:
  `cp .env.example .env.local` (overwrites the stack-synced `.env.local`),
  `docker compose down` and `docker compose down --volumes` (stop the services and delete
  their data). `yarn shadcn add <component>` is a placeholder and `yarn build` is a production
  build, which the rules reserve for an explicit request.
- The punctuation grep after the last edit, over `README.md`, `docs/architecture.md`,
  `docs/deposit-build-plan.md`, this report, `.env.example`, `AGENTS.md`, `src` and
  `integration-tests`: no em dash, no en dash, no sentence starting with "Because", and no
  prose semicolon outside fenced code blocks and tables of commands.
- The invalidated-name grep, exact pattern in the plan's findings entry: no stale name in any
  file the stage may edit. `startBackend` is the live export of `src/server/start.ts` (the
  task file listed it beside the renamed `run*` loop functions, but it was never renamed), and
  `Pending` and `Starting` are English words in a badge label and a describe name.

## Diagram labels left for the user

Read from the `.drawio` files and `drawio.config.json` without editing them.

1. `docs/transaction-state-machine.drawio`: the edge label `recordRejection: Records the
Rejected, FailEntirely or FailFallible failure` describes the single action from before the
   Stage 8b review split. `recordRejection` now records only `Rejected` and leaves only
   `AwaitingSubmission`, and `recordLedgerFailure: Records the FailEntirely or FailFallible
failure` is the edge from `AwaitingInclusion` to `Failed`. `drawio.config.json`'s
   `lint.subjects` needs `recordLedgerFailure` for that label.
2. `drawio.config.json`: `resolveDepositState` in `lint.subjects` is an invalidated name (the
   deposit resolver's method is `resolveDeposit`).
3. The deposit state machine, to be drawn as `docs/deposit-state-machine.drawio`: states
   `AwaitingStartTransaction`, `AwaitingVaultRequest`, `AwaitingCompletion`,
   `AwaitingCompleteTransaction`, `Completed`, `Failed`. Caller edges `startDeposit` (creates
   the row and the start call) and `completeDeposit` (`AwaitingCompletion` to
   `AwaitingCompleteTransaction`). Resolver edges `recordStarted`, `recordStartFailure`
   (records the `StartFailed` failure), `recordAttested`, `recordCompleted` from both
   `AwaitingCompleteTransaction` and `AwaitingCompletion` to `Completed` (the Stage 8b arrow),
   `recordCompleteFailure` back to `AwaitingCompletion`. No expiry edge.
4. The vault request state machine, to be drawn as `docs/vault-request-state-machine.drawio`:
   `AwaitingFlush`, `AwaitingSend`, `AwaitingSignature`, `AwaitingBroadcast`,
   `AwaitingAttestation`, `AwaitingAttestationQueue`, `AwaitingAttestationFlush`, `Attested`,
   one resolver edge each (`recordFlushed` stores `outIndex`, `recordSent` stores `requestId`,
   `recordSignature` stores `signedTx`, `recordBroadcast`, `recordAttestation` stores the five
   `attestation*` fields, `recordAttestationQueued`, `recordAttested`), `queueRequest` as the
   creating edge, no failure state, no expiry edge.
5. The Ethereum transaction state machine, if drawn: `AwaitingSubmission`, `AwaitingInclusion`,
   `Succeeded`, `Failed`, with `recordRejection` from `AwaitingSubmission` (the `Rejected`
   failure), `recordFailure` from `AwaitingInclusion` (`Reverted` or `NonceConsumed`),
   `recordSuccess`, and `expireTransaction` from both waiting states.

## Invalidated names not fixed, and where

- `resolveDepositState` in `drawio.config.json` (`lint.subjects`): the user's file.

Nothing else. `docs/diagramming.md` no longer holds the bare transaction names the Stage 3
finding reported, and the plan's Stage 9 list named `docs/architecture.drawio` and
`docs/deposit-state-diagram.drawio`, both of which the user's diagramming work has deleted from
the tree (`git status` shows them as `D`).

## What in the README I was unsure of

- Durations are this stack's: the figures come from the two runs above and Stage 8's and 8b's
  runs, and the text says "on the local stack" wherever a number appears. A longer chain or a
  loaded host changes every one of them.
- The "Deposit lifecycle" section and the entity sections overlap by design: the lifecycle
  section narrates the order and the actors and links to each definition, and I kept the
  definitions where they were. A reader who finds the same fact told twice should find the
  entity section the fuller telling.
- The Testing table's "Covers" column was written from the test names and bodies, not from a
  coverage report.
- `docs/architecture.md` keeps its design-time prose (the job API with `POST /api/transactions`,
  the Deposit API in AIP style) under the new mapping section, since it is the record of the
  reasoning. Only the opening and the "Mapping onto this repository" table now describe the
  code.
