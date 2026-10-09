# Stage 4 report: the vault request entity

Worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
`bernard/rebuild`. The tree is uncommitted. The user's diagram files, `drawio.config.json` and the
`## Diagrams` section of `AGENTS.md` are untouched.

## What was built

New under `src/lib/midnight/ethereum-erc20-vault/vault-request-v1/`:

- `vault-request.ts`: `vaultRequestSchema` and `VaultRequest`, `VAULT_REQUEST_COLLECTION`,
  `vaultRequestNameSchema`, `vaultRequestName`, `VAULT_REQUEST_STATES`,
  `VAULT_REQUEST_TERMINAL_STATES` (`Attested`), `ATTESTATION_OUTPUT_KINDS` (tied to the SDK's
  `OutputKind` names by `satisfies`), `ATTESTATION_SIGNATURE_BYTES` and `AttestationFields`. Zod
  only, no Midnight package at runtime (see the drizzle-kit finding).
- `vault-request-attestation.ts`: `attestationFields(outcome)` and `attestationToEvent(request)`,
  the codec between the five row columns and the SDK's `RespondBidirectionalEvent`. The
  signature is `bigR.x || bigR.y || s || recoveryId`, 97 bytes in hex.
- `vault-request-repository.ts` (`VaultRequestRepository = Repository<VaultRequest>`) and
  `vault-request-repository-sql-impl.ts`.
- `vault-request-state-machine.ts`: `nextState` over the seven `record*` actions, each legal from
  one state, `INITIAL_STATE` (`AwaitingFlush`), `assertConsistent` over `FIELDS_BY_STATE`.
- `vault-request-state-controller.ts`: `VaultRequestStateController` (`queueRequest`, seven
  `record*` methods, `startSend`, `startBroadcast`, `startAttestationQueue`), the args
  interfaces, `VaultRequestStateConflict`, `vaultRequestEventDataSchema`,
  `VAULT_REQUEST_EVENT_BY_STATE` (`midnight.ethereum-erc20-vault.vault-request-v1.<kebab-state>`)
  and `VAULT_REQUEST_EVENTS`.
- `vault-request-state-controller-impl.ts`: the transitions in the transaction shape, and the
  three starters, which lock the row, refuse with the conflict unless the row is in the state the
  step serves, commit the child through the child's controller (Midnight: `AwaitingProof`,
  `signer: 'relayer'`, one-hour `expireTime`; Ethereum: `AwaitingSubmission`, `expireTime` null),
  and map a Postgres `23505` on the thrown error or its `cause` to `VaultRequestStateConflict`.
- `vault-request-state-resolver.ts` and `-impl.ts`: `resolveVaultRequest`,
  `resolveWaitingFlushes` (`AwaitingFlush` and `AwaitingAttestationFlush`), `resolvePending`
  (every non-terminal state). The sweeps read the ledger once and log one row's failure without
  stopping. `RespondOutcomeSources = Record<VaultAction, RespondOutcomeSource>` is exported here.
- `vault-request-event-consumer.ts`: wants the request's own lifecycle events and the terminal
  events of Midnight and Ethereum transactions whose `parent` is a vault request name.
- `vault-request-fixtures.ts`: `vaultRequestFixture`, `VAULT_REQUEST_IN_STATE`, the names, the
  ledger constants (`IN_INDEX`, `OUT_INDEX`, `REQUEST_ID`, `LAST_SEEN`,
  `ATTESTATION_BLOCK_HEIGHT`), a real MPC response key pair and a genuine attestation minted
  with `@sig-net/midnight/testing` (`ATTESTATION`, `ATTESTATION_FIELDS`).
- Tests: `vault-request-state-machine.test.ts`, `vault-request-attestation.test.ts`,
  `vault-request-state-controller-impl.test.ts`, `vault-request-state-resolver-impl.test.ts`,
  `vault-request-event-consumer.test.ts`.

New beside the folder under `src/lib/midnight/ethereum-erc20-vault/`:

- `vault-action.ts`: `VAULT_ACTIONS` and `VaultAction`, moved out of `vault-ledger.ts`.
- `signet-readers.ts`: `SignetReaders` and `signetReaders(config)`, one reader per action, no
  `signetEventsFromBlock`.
- `respond-outcome-source.ts`: `RespondOutcomeSource`, `AttestedOutcomeArgs`, `RespondOutcome`,
  and `firstVerifiedOutcome(posts, candidateOf, key)` shared by both impls.
- `respond-outcome-source-evm-node-impl.ts` and `respond-outcome-source-mpc-cache-impl.ts`, with
  a test each.
- `vault-ledger-fixtures.ts`: `ledgerMap` (hoisted from `vault-ledger.test.ts`) and
  `requestLedgerState(overrides)`.

Changed:

- `vault-ledger.ts`: `RequestStage`'s `attestationQueued` and `attestationFlushed` carry
  `outIndex` and `lastSeen`; `RequestLedger` port and `RequestLedgerState` type added,
  `VaultLedger extends RequestLedger`. `vault-ledger.test.ts` follows.
- `vault-circuits.ts`: `SEND_CIRCUIT_BY_ACTION`, `QUEUE_ATTESTATION_CIRCUITS`,
  `queueAttestationCircuit(outputLength)`. `vault-circuits-midnight-js-impl.ts` picks the queue
  circuit through it.
- `src/lib/value-schemas.ts`: `hex32BytesSchema` and `evmBytesSchema` (hoisted from the Ethereum
  resource's private `EVM_BYTES`, which `src/lib/ethereum/transaction-v1/transaction.ts` now
  imports).
- `src/lib/config/midnight-respond-output-config.ts`: `MidnightRespondOutputConfig` is a
  discriminated union on `source`.
- `src/lib/db/schema.ts`: `midnightEthereumErc20VaultRequestsV1` with the partial unique index
  `midnight_ethereum_erc20_vault_requests_v1_live` on `(parent, action)`, and the loader
  constraint stated at the top. Migration `drizzle/0011_vault_requests.sql`, journal tag
  `0011_vault_requests`, `drizzle/meta/0011_snapshot.json`.
- `src/server/backend.ts`: `EthereumBackend.provider`, `createMidnight(db, event, ethereum,
config)`, `ethereumErc20Vault.signetReaders`, `.respondOutcomeSources` (picked by
  `RESPOND_OUTPUT_SOURCE`) and `.vaultRequestV1 = { repository, stateController, stateResolver,
eventConsumer }`. `src/server/start.ts` registers the consumer.
- `scripts/check-boundaries.ts`: `signet-readers.ts` in `BACKEND_FILES`.
- `integration-tests/ethereum-erc20-vault-request.test.ts`: five tests.
- `README.md`: a "Vault requests" section before "Composition", the layout row for
  `ethereum-erc20-vault` reworded and a row for `vault-request-v1` added.
- `docs/deposit-build-plan.md`: Stage 4 text corrected to what was built, every Stage 4 box
  ticked, R11 and R12 ticked, six findings appended.
- `.scratch-spike/spike-signet-reader-walk.mts` (gitignored): the R11 timing probe.

## Verification, with the observed output

- `yarn typecheck`: four `TS6133` errors, all in
  `src/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller-impl.ts` (lines 13,
  14, 21, 25), exit 1. Nothing else.
- `yarn lint`: two `eslint(no-unused-vars)` errors in that same file (21:16, 25:23), exit 1. Two
  warnings this stage introduced in the resolver test (`consistent-return`,
  `no-unsafe-type-assertion`) were fixed and the rerun shows no diagnostic in any Stage 4 file.
- `yarn format` then `yarn format:check`: "All matched files use the correct format. Finished in
  242ms on 218 files using 12 threads."
- `yarn boundaries`: with `src/lib/planted-violation.ts` importing `signetReaders`:
  "src/lib/planted-violation.ts: imports @/lib/midnight/ethereum-erc20-vault/signet-readers, but a
  backend module is only used inside the backend and src/server", exit 1. The planted file was
  removed (it was new, so nothing needed restoring) and the rerun printed "Boundaries hold across
  196 files (148 backend imports checked)".
- `yarn test`: "Test Files 19 passed (19), Tests 364 passed (364)". Stage 3 ended at 193 tests,
  so 171 are new (the resolver file alone holds 40).
- `yarn test:integration` with no dev server running (`ps aux | grep "[n]ext dev"` counted 0):
  "Test Files 5 passed (5), Tests 13 passed (13), Duration 10.22s" on the final run. The vault request file alone
  passed three further runs.
- Migration: `yarn db:generate` printed "Your SQL migration file ➜ drizzle/0011_neat_pandemic.sql",
  renamed to `0011_vault_requests.sql` with the journal tag changed; `yarn db:migrate` printed
  "migrations applied successfully". `\d midnight_ethereum_erc20_vault_requests_v1` shows the
  sixteen columns, the primary key and the partial unique index `(parent, action) WHERE state <>
'Attested'`; `drizzle.__drizzle_migrations` holds row 12 for it.
- R11 timing: `NODE_OPTIONS=--conditions=react-server node_modules/.bin/tsx --env-file=.env.local
.scratch-spike/spike-signet-reader-walk.mts` printed "run 0: 0 posts, 17 ms", "run 1: 0 posts,
  4 ms", "run 2: 0 posts, 4 ms".

## Where the pack was wrong, missing or ambiguous

- "Two helpers in the resource file": impossible as stated. `src/lib/db/schema.ts` imports the
  resource for its state enum, and `yarn db:generate` loads the schema through a CommonJS loader
  that cannot resolve `@midnight-ntwrk/platform-js` (no CommonJS build). The first generate run
  failed with "Cannot find module .../platform-js/dist/cjs/effect/ContractAddress.js". The
  helpers moved to `vault-request-attestation.ts`, and `VAULT_ACTIONS` moved out of
  `vault-ledger.ts` (which imports the contract package) into `vault-action.ts` for the same
  reason. The pack said to reuse `VAULT_ACTIONS` from `vault-ledger.ts`, and it is still one
  definition, just in a lighter file.
- "`getSignedEvmTransaction` gives the hash" for finding the mined transaction in the EVM node
  source: that method needs the expected signer, which the port's args do not carry. The prep
  code's way was used instead: rebuild each signature post with
  `signBidirectionalEventToSignedEvmTransaction(request, post)` and ask for its receipt.
- `RequestStage` as Stage 2 left it carried no `outIndex` for the two attestation stages, so the
  plan's `AwaitingFlush` rule ("if not queued, record the flushed index") could not be written
  against it. The stage type was widened.
- The plan's `AwaitingBroadcast` rule records the step on any terminal child. A child that ended
  `Rejected` (the node refused the bytes, transport failures included) or `Expired` put nothing
  on chain, so the MPC never attests it and the request would wait for ever. Such a child is
  replaced instead.
- The pack does not say that a mocked `VaultLedger` cannot be built in a unit test without a
  cast: `VaultLedgerState` is the generated contract's whole ledger type. The `RequestLedger`
  port (six maps plus `mpcResponseKey`) was added so the resolver can be tested against fakes.
- The pack's "Testing" section says the SDK's call-frame decoder takes the frame, and it also
  requires the frame's `type` field (any value), which anvil's callTracer sets to `CALL`. A test
  frame without it fails with "debug_traceTransaction result has no call frame `type`".
- `verifyRespondBidirectionalSignature` ignores the posted `digest` and recomputes it. A
  "forged" post that only changes the digest verifies. The pack did not say so.
- The `MpcOutputCacheReader` constructor requires `networkId` and `signetContractAddress`
  beside `cacheUrl`, while the pack listed only the URL.
- Vitest's default reporter swallowed a `console.log` inside an integration test, so the R11
  timing was measured with a spike instead.
- `yarn db:generate` prompted nothing for a new table, as the pack said.

## Decisions that deviate from the plan, and why

1. The attestation codec and the action set live in their own light files (above).
2. `RequestStage` attestation stages carry `outIndex` and `lastSeen`; `RequestLedger` port.
3. A `Rejected` or `Expired` broadcast child is replaced, never recorded as the step done.
4. The consumer also wants the request's own lifecycle events, as the transaction consumers do,
   so each recorded step nudges the next without waiting for the sweep.
5. The outcome sources are held one per action (`respondOutcomeSources`), each over its action's
   reader, so the port's args stay `{ requestId, mpcResponseKey }` as the plan wrote them.
6. `MidnightRespondOutputConfig` became a discriminated union, so the composition root needs no
   re-check of `MPC_OUTPUT_CACHE_URL` (only `server-config.ts` consumed the type).
7. `EthereumBackend` exposes its ethers provider and `createMidnight` receives the Ethereum
   package, so the EVM node source shares the cache-free provider the ledger uses.
8. `queueAttestationCircuit(outputLength)` and `SEND_CIRCUIT_BY_ACTION` live in
   `vault-circuits.ts` and the circuits impl picks the queue circuit through the former, so the
   width set is defined once.
9. `evmBytesSchema` hoisted to `value-schemas.ts` at its second consumer, and the Ethereum resource
   imports it.
10. The sweeps read the ledger once per sweep and log a row's failure, so the rest of the sweep
    still runs.
11. The `settled` guard logs through `console.error`, as the plan's stale check does.
12. The guard's `BACKEND_FILES` gained `signet-readers.ts`; `AGENTS.md` was not edited (it holds
    the user's uncommitted section), so its list of backend-owned files is now behind the guard
    by `-circuits.ts`, `relayer-wallet.ts` and `signet-readers.ts`.

Not changed on purpose: four pre-existing prose semicolons in doc comments on lines this stage
did not write (`midnight-respond-output-config.ts:5`, `vault-circuits.ts:11`,
`vault-circuits-midnight-js-impl.ts:176`, `backend.ts:141`) and a "rather than" in the README's
deposit API section.

## What the Stage 5 agent (the flusher) must know

- `resolveWaitingFlushes()` on `backend.midnight.ethereumErc20Vault.vaultRequestV1.stateResolver`
  searches `AwaitingFlush` and `AwaitingAttestationFlush` rows (oldest first), reads the vault
  ledger once, and resolves each: a row the ledger shows flushed moves to `AwaitingSend` with its
  request index, a row the ledger shows attestation-flushed (or settled) moves to `Attested`. It
  swallows nothing but `VaultRequestStateConflict` per row and logs any other failure with the
  row's name. Call it after a flush lands: there is no flush event and the consumer wants none.
  `resolvePending()` is the full sweep for Stage 7's interval.
- What the flusher should carry: the SDK's `flushPending` fills slots from the ledger itself
  (queued attestations, then queued requests, in ledger order), so the flusher needs no row
  list. A `queued` request stays in `AwaitingFlush` until the flush moves it, and the resolver never
  builds a flush.
- `VaultProviders` for `flushPending`: `backend.midnight.publicDataProvider` (the indexer),
  `backend.midnight.relayerWallet.provider()` for the wallet and midnight provider slots (it
  returns both, per the Stage 2 finding), and the zk config provider and proof provider that
  `createMidnightEthereumErc20Vault` and `createMidnightTransactionV1` build privately today
  (`new NodeZkConfigProvider<VaultCircuitId>(assetsPath)` and the lazy `httpClientProofProvider`
  with the registry). Stage 5 must expose those two from the composition root, since nothing else
  constructs them.
- The relayer wallet must be started (`startBackend()` does it) before a flush can be balanced.
- The signet reader walks the singleton's whole event history per call. Fine today (no events),
  linear in the singleton's history later. If it ever matters, the row would need the Midnight
  block of its send to bound a per-request reader, and nothing stores that yet.
- The vault request row is a cache of the ledger: never advance it from a child's outcome. The
  controller refuses a starter whose row is not in the state the step serves, and refuses a
  second live child through the child's live index (mapped to the conflict), so a duplicate
  flusher nudge is harmless.
- Event types to expect on the topic: the eight
  `midnight.ethereum-erc20-vault.vault-request-v1.<kebab-state>` events, data `{ name, parent }`.
  They are new types, so nothing stale is on the local topic.
- `yarn lint` and `yarn typecheck` still fail on the deposit placeholder file, so a green run needs
  Stage 6's implementation or `_`-prefixed parameters.
