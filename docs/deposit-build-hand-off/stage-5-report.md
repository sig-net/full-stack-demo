# Stage 5 report: the flusher

Worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
`bernard/rebuild`. The tree is uncommitted. The user's diagram files, `drawio.config.json` and the
`## Diagrams` section of `AGENTS.md` are untouched, as is every Stage 3 and Stage 4 file this stage
did not need to edit.

## What was built

New under `src/lib/midnight/ethereum-erc20-vault/`:

- `flusher.ts`: the `Flusher` interface, one method `flush(): Promise<void>`.
- `flusher-impl.ts`: `FlusherImpl(runFlush, onFlushed)`, one run in flight per process with a
  `runAgain` flag (the outbox processor's shape), `isLostRace` (module private) over
  `CallTxFailedError` with status `FailFallible` and the regex
  `/^failed assert: (?:Request not queued|Identical request open|Attestation not queued)$/`. Any
  other failure is logged with `console.error('Flush failed', error)` and ends the run. A landed
  flush (`filled > 0`) awaits `onFlushed()` and runs again.
- `flush-event-consumer.ts`: `FlushEventConsumer(flusher)` wants
  `VAULT_REQUEST_EVENT_BY_STATE.AwaitingFlush` and `.AwaitingAttestationFlush`, `safeParse`s the
  data with `vaultRequestEventDataSchema` (throws on malformed data, as every consumer does) and
  awaits `flusher.flush()`.
- `flusher-impl.test.ts` (12 tests) and `flush-event-consumer.test.ts` (13 tests).

Changed:

- `src/server/backend.ts`: the lazy `httpClientProofProvider` moved from
  `createMidnightTransactionV1` to `createMidnight`, which passes it to both packages (the
  `PROOF_TIMEOUT_MS` constant moved beside it). `createMidnightEthereumErc20Vault` keeps the
  `NodeZkConfigProvider<VaultCircuitId>` and `compiledVaultContract(assetsPath)` as locals shared
  by the circuits impl and the flusher, builds `vaultRequestV1` first, then
  `createVaultProviders(...)` (a `lazySingleton` returning `VaultProviders`: the in-memory private
  state provider under `permissionlessVaultPrivateState()`, the indexer, the zk config provider,
  `await proofProvider()`, and `await relayerWallet.provider()` in both the wallet and midnight
  slots), then `new FlusherImpl(async () => flushPending(await providers(), compiledContract,
vaultAddress), () => vaultRequestV1.stateResolver.resolveWaitingFlushes())`. The backend holds
  `ethereumErc20Vault.flusher` and `ethereumErc20Vault.flushEventConsumer`. Neither the provider
  set nor the zk config provider is on the `Backend` object.
- `src/server/start.ts`: registers `flushEventConsumer` after the vault request consumer.
- `src/lib/midnight/wallet/relayer-wallet.ts`: `provider(): Promise<WalletProvider &
MidnightProvider>` joined the interface, with the doc moved from the seed impl.
- `src/lib/midnight/ethereum-erc20-vault/vault-circuits-midnight-js-impl.ts`: exports
  `permissionlessVaultPrivateState()` (a random 32-byte secret through `createVaultPrivateState`),
  used by `sendDeposit`, the three `queueAttestation*` branches and the flusher's provider set.
  `build` takes a `VaultPrivateState`, and the two user circuits pass
  `createVaultPrivateState(args.secretKey)`.
- `scripts/check-boundaries.ts`: `flusher.ts` in `BACKEND_FILES` (no suffix covers it).
- `integration-tests/ethereum-erc20-vault-flush.test.ts`: one test.
- `README.md`: a "Flushing the vault queue" subsection under "Vault requests", the layout row for
  `ethereum-erc20-vault` names the flusher, and the relayer wallet section describes `provider()`.
- `docs/deposit-build-plan.md`: Stage 5 text rewritten to what was built, every Stage 5 box
  ticked, five findings appended.
- `.scratch-spike/spike-flush-assert.mts` and `spike-flush-cold.mts` (gitignored probes).

## Verification, with the observed output

- `yarn typecheck`: "✓ Types generated successfully", then four `TS6133` errors, all in
  `src/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller-impl.ts` (lines 13,
  14, 21 and 25). `grep -c "error TS"` on the output counts 4. Nothing else.
- `yarn lint`: two `eslint(no-unused-vars)` errors in that same file (21:16, 25:23). Nothing
  else.
- `yarn format` then `yarn format:check`: "All matched files use the correct format. Finished in
  252ms on 224 files using 12 threads." `yarn format:check` before the formatting run listed only
  the two new test files, so the formatter touched nothing of the user's. One markdown wrap in the
  plan (a continuation line beginning with the tail of a code span) could not be settled by the
  formatter, so that bullet was rewrapped by hand.
- `yarn boundaries`: with `src/lib/planted-violation.ts` holding
  `import { Flusher } from '@/lib/midnight/ethereum-erc20-vault/flusher'`:
  "src/lib/planted-violation.ts: imports @/lib/midnight/ethereum-erc20-vault/flusher, but a
  backend module is only used inside the backend and src/server", exit 1. The planted file was
  removed (it was new) and the rerun printed "Boundaries hold across 201 files (161 backend
  imports checked)". The final run, after the integration test file was added, prints 202 files.
- `yarn test`: "Test Files 21 passed (21), Tests 389 passed (389)". Stage 4 ended at 364, so
  25 are new.
- `yarn test:integration` with no dev server running (`ps aux | grep "[n]ext dev" | wc -l`
  printed 0): "Test Files 6 passed (6), Tests 14 passed (14), Duration 11.14s". The flush file
  alone: "Tests 2 passed (2), Duration 2.63s" on its first shape, 1 test on its final shape, both
  green.
- `.scratch-spike/spike-flush-assert.mts` (`NODE_OPTIONS=--conditions=react-server
node_modules/.bin/tsx --env-file=.env.local <file>`): "queued requests 0n queued attestations
  0n globalLastSeen 11856106n", then for a request slot the ledger does not hold
  `{ instanceOfError: true, constructor: 'Error', name: 'Error', message: 'failed assert: Request
not queued', isCompactError: undefined, cause: ContractRuntimeError ... }` whose own cause is
  `CompactError: failed assert: Request not queued`, and for an attestation slot the same with
  `Attestation not queued`.
- `.scratch-spike/spike-flush-cold.mts`: "before the flush, finalize rejects with: The relayer
  wallet was not started: start the backend first", "first flush on a cold backend took 392 ms",
  "second flush took 11 ms", "after the flush, finalize rejects with: Unable to deserialize
  Transaction. Error: expected header tag 'midnight:transact", "globalLastSeen 11856106n ->
  11856106n".

## Where the pack was wrong, missing or ambiguous

- The three assert messages are not thrown bare. The compact runtime's `assert` throws a
  `CompactError` whose message is `failed assert: ` plus the contract's text, compact-js wraps
  that in a `ContractRuntimeError`, and
  the midnight-js build rethrows a plain `Error` whose message is the prefixed text
  (`failed assert: Request not queued`), with the chain under `cause`. The SDK's own `flushUntil`
  matches the prefixed form, and `isLostRace` does the same. The pack's "a plain `Error` carrying
  one of `flushQueue`'s assert messages" would have led to a bare-message match that never fires.
- `backend.midnight.relayerWallet.provider()` did not exist on the `RelayerWallet` interface,
  only on `RelayerWalletSeedImpl`, while `createMidnightEthereumErc20Vault` receives the
  interface. It was added to the interface.
- "`FlusherImpl` takes a `runFlush` function and an `onFlushed` callback": done as said, but the
  plan's sketch (constructor over `providers`, `compiled`, `vaultAddress`) was what the plan
  showed, so the plan text was rewritten to the function shape.
- The pack did not say how a `CallTxFailedError` can be built in a unit test. `FinalizedTxData`
  needs a real `Transaction<SignatureEnabled, Proof, Binding>`, so the test passes
  `mock<FinalizedTxData>('FinalizedTxData', { status })` to the constructor, which only spreads
  it into a JSON message.
- `Promise.withResolvers` is not available: `tsconfig.json` targets ES2023, so the coalescing
  test uses a hand-made gate.
- The relayer wallet syncs in under a second on this stack (the first cold flush took 392 ms in
  total), so a timing assertion cannot show that the flush started the wallet. The integration
  test observes `finalize('00')` rejecting with "was not started" before the flush and with a
  deserialisation error after it.
- `oxfmt` formats markdown too (`README.md` and the plan are in its 224 files, `AGENTS.md` is
  ignored by `.oxfmtrc.json`), so `yarn format` realigns README tables after an edit.
- The pack's command for one integration file works but Vite prints a `configLoader: 'native'`
  warning about `import "./vitest.config"` lacking an extension. Harmless, not this stage's.

## Decisions that deviate from the plan, and why

1. `FailEntirely` is not a lost race. `submitFlush` throws `CallTxFailedError` for any status but
   `SucceedEntirely`, and a guaranteed-section failure (the proof check or the fee payment) would
   repeat on a rerun, so it is logged and ends the run, as the SDK's `flushUntil` rethrows it.
2. No bound on consecutive lost races, as the plan sketches. Every lost race means another flush
   moved items, so the queue drains either way. Stage 7 may want a bound if a second process ever
   flushes the same vault for long.
3. The consumer awaits `flush()`, so the hub holds every other consumer for the run's duration.
   A detached run would hide a rejected nudge (a failed `resolveWaitingFlushes`) from the hub's
   redelivery, and the plan's backpressure bullet accepts the wait for the demo. Recorded in the
   findings and the README.
4. The provider set is assembled by `createVaultProviders` in the composition root, as the Stage 2
   decision ("no `vault-providers.ts`") requires, and it is not on the `Backend` object: nothing
   else consumes it. The Stage 7 sketch draws `providers (relayer)` and `zkConfigProvider` on the
   backend, which Stage 7 can still do if a second consumer appears.
5. `permissionlessVaultPrivateState()` is exported from the circuits impl at its second consumer,
   and `build` takes a private state. The fact "a random secret proves a permissionless call" is
   defined once.
6. A failed `onFlushed` rejects `flush()` (tested): the hub redelivers the nudge, and the next
   call starts a fresh run.
7. `AGENTS.md` was not edited (it holds the user's uncommitted section), so its list of
   backend-owned files is now behind the guard by `-circuits.ts`, `relayer-wallet.ts`,
   `signet-readers.ts` and `flusher.ts`.

## What the Stage 6 agent (the deposit entity and its services) must know

- How a user circuit's unproven call is built today: `VaultCircuits.startDeposit({ secretKey,
wallet, inIndex, evmNonce, gas, erc20Address, amount })` and `completeDeposit({ secretKey,
wallet, requestId, serializedOutput, mintNonce })` (`vault-circuits.ts`) resolve with the
  unproven transaction as hex. `wallet` is `WalletPublicKeys` (`coinPublicKey`,
  `encryptionPublicKey`, the browser wallet's), which `createUnprovenCallTx` reads for every
  circuit (R9). The impl builds a `PrivateStateProviderMemoryImpl` per call holding
  `createVaultPrivateState(secretKey)` and discards it. Building reads the vault's state from the
  indexer (one network round trip, hundreds of milliseconds, see Stage 2's spike-backend numbers)
  and runs the circuit locally, which is where the contract's own asserts fire: a bad argument
  surfaces at build time as a plain `Error` whose message is `failed assert: <message>` with the
  `ContractRuntimeError` under `cause`, so the service can turn it into a validation outcome
  before anything is written.
- Where the slow build belongs: outside the adaptor's `runInTransaction`. The rule is that a
  transaction wraps one boundary call and never a slow external call, and the build is an
  indexer read. The vault request resolver already does it that way for the relayer's circuits
  (build, then one `write`). For `startDeposit` the adaptor can build before opening the
  transaction and pass `unprovenTx` to the service, or the service can take a `build` step before
  its `runInTransaction`. The plan's Stage 6 bullet asks for the decision to be recorded. Note
  that the nonce assignment reads the chain too (`getTransactionCount` on
  `backend.ethereum.provider`, built with `cacheTimeout: -1`), so it belongs outside as well, and
  the uniqueness of `inIndex` and the live-row index are what the transaction protects.
- The relayer wallet: `RelayerWallet` now has `provider()`, and the first flush starts the wallet
  if `startBackend()` has not, so an integration test that flushes needs no explicit start. A
  `finalize` before any start still rejects with "was not started". The sync is sub-second on
  this stack.
- The SDK's balancing surprised nothing this stage: with nothing queued `flushPending` returns 0
  before touching the wallet. A flush that moves an item (proving, balancing, inclusion) has not
  been run from this backend yet. Stage 8's first leg (queue a deposit with the user wallet, flush,
  watch `inputRequestBuffer` release the index) is still to be built, and it needs a user wallet
  built from the SDK packages directly under `integration-tests/` (the boundary rule forbids
  importing `seed-wallet-facade.ts`), which is why it was not built here.
- The flush nudge path for a deposit: `queueRequest` publishes `awaiting-flush`, the
  `FlushEventConsumer` runs the flush (the hub waits), `resolveWaitingFlushes` moves the row to
  `AwaitingSend` and publishes, and the vault request consumer carries on. The deposit's own
  consumer only needs the vault request's terminal event, as the plan says.
- The stack's vault currently holds no queued request or attestation and `globalLastSeen` is
  11856106 (spike output above). The integration test asserts that emptiness as a precondition
  with a readable diff, so a leftover from a crashed end-to-end run shows up there first.
- `yarn lint` and `yarn typecheck` still fail only on the deposit placeholder file, so Stage 6's
  implementation is what makes `yarn check` green end to end.
