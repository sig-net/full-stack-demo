# Stage 9: documentation, rules and the invalidated-name grep

Read `## Stage 9` in `docs/deposit-build-plan.md` first, then this file, then the last section
of `scratch-hand-off-pack/stage-8-report.md`, which the previous agent wrote for you. You
change no behaviour. The code is done and proven: the end-to-end deposit passes against the
live stack in about four minutes.

## What to do

1. README.md, a full pass, self-contained for a human reader, no pointers to agent files:
   - A "Deposit lifecycle" section that tells the story once, in order: the five entities
     (deposit, vault request, Midnight transaction, Ethereum transaction) and the flusher, who
     acts at each step (the user's wallet, the backend's relayer wallet, the MPC, the fork), the
     ledger-as-acknowledgement rule, the parent nudge through `{ name, parent }` in child
     events, the sweep and why it is load-bearing, the two user actions and what the browser
     supplies (the caller secret and the wallet's public keys), and the one case the design
     keeps unreachable (the stale attestation, through the nonce assignment).
   - Reconcile every existing section with what was built across Stages 1 to 8. The Stage 8
     report lists the claims that differ from observation: "minutes" where the stack takes
     seconds (relayer sync, a flush, a proof), and any section the agents added in passing that
     now overlaps the new one. One telling per fact: when two sections say the same thing,
     keep the one at the definition and link to it.
   - The environment variable table complete and accurate, the layout table complete, the
     scripts list accurate, the testing section describing unit, integration and end-to-end
     runs with their commands (every command run verbatim first) and durations.
   - British spelling, no em dashes, no prose semicolons, no sentence starting with "Because".
2. AGENTS.md, the rules file. It holds the user's uncommitted `## Diagrams` section at its
   end: leave that section byte for byte. Elsewhere, extend the existing sections with the
   decisions the stages took, each as a rule a future change must obey, not as history:
   - Lifecycle, as separate bullets: a child's lifecycle events carry `{ name, parent }` and
     the parent's consumer matches on the parent's collection. A chain step is read back from
     the ledger and never inferred from a child transaction's outcome. A vault-level batch
     (the flush) is a process with no row. A transaction row names its signer. The sweep calls
     every resolver's `resolvePending()` and fires the flusher.
   - Service methods: a service method whose write must follow a slow build (a circuit call,
     a chain read) opens the transaction itself after the build, and its adaptor wraps nothing.
   - Boundaries: the backend-owned list gains `-circuits.ts`, `relayer-wallet.ts`,
     `signet-readers.ts`, `flusher.ts`, `sweep.ts` and `delay-unless-aborted.ts`, matching
     `scripts/check-boundaries.ts` exactly (read the script's lists and copy them).
   - Validation boundaries: resource files the database schema imports stay free of SDK
     runtime imports, since drizzle-kit loads the schema through a CommonJS loader.
   - Events: a change to an event's data shape is a change to events already on the topic, so
     fields are added as optional or published under a new type.
   - Testing: the end-to-end test and when it runs.
     Every rule you add was established by execution in an earlier stage: cite nothing, state
     the rule. Keep the file's tone and bullet shape.
3. The invalidated-name grep. Each stage renamed or removed names: the deposit's old states
   (`Starting`, `AwaitingEVM`, the old `AwaitingFlush` and `AwaitingSend` on the deposit),
   `resolveDepositState`, the Ethereum transaction's `Signing`, `Submitting`, `Pending`,
   `unsignedTx`, the bare `TransactionStateController`, `TransactionLedger`,
   `TransactionStateResolver`, `TransactionEventConsumer`, `TRANSACTION_EVENT_BY_STATE`
   (now prefixed `Midnight` or `MIDNIGHT_`), `startBackend`, `startEventConsumerHub`,
   `startOutboxEntryProcessor` (now `run…`), `transaction-relayer-wallet`. Grep the whole
   repository (`src`, `integration-tests`, `scripts`, `README.md`, `docs/*.md`, `AGENTS.md`,
   `.env.example`) for each, in its most specific form, and fix every hit in a file you may
   edit. Do not edit any `.drawio` or `.png` file or anything under `docs/` the user is working
   on (`diagramming.md`, `diagram-palette.*`, `backend-components.*`,
   `transaction-state-machine.*`, `diagram-assets/`): list the hits there in your report for
   the user. `docs/architecture.md`, if it exists, is yours to update.
4. `docs/deposit-build-plan.md`: tick Stage 9's boxes after each item above is done and
   verified, and add a closing findings entry with the final counts (unit tests, integration
   tests, end-to-end duration) and the list of diagram labels the user still needs to update.
5. `.env.example`: every variable the backend or the tests read, with its comment, and
   nothing else.

## Verification

- `yarn check` green, `yarn format` before `yarn format:check`.
- `yarn test:integration` green with no dev server running (`ps aux | grep "[n]ext dev"`). It
  takes about five minutes because of the end-to-end file.
- Every command quoted in README.md was run verbatim by you, in this stage, and its output
  matches what the text says.
- A final grep for em dashes, prose semicolons and sentences starting with "Because" across
  README.md, docs/*.md you edited, `.env.example` and every `.ts` comment under `src` and
  `integration-tests`, with the hits fixed (code and tables excluded).

## Report

Write `scratch-hand-off-pack/stage-9-report.md`: what you changed (file list), each
verification with its observed output, the diagram labels left for the user, every hit of an
invalidated name you could not fix and where, and anything in the README you were unsure of.
