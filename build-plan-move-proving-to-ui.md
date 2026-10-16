# Build plan: move the deposit's circuit building and proving into the browser

The deposit's two caller calls (`startDeposit`, `completeDeposit`) are built, proved, balanced
and bound in the browser. The backend attaches the DUST fee from the relayer wallet (DUST
sponsorship) and submits. Every other operation keeps working exactly as it does today, built
and proved on the backend.

Each step below leaves the project compiling, `yarn check` green and the named integration
tests passing. A step is one commit's worth of work. Nothing is committed or pushed without
being asked.

## Scope

In scope:

- The deposit's start and complete calls, from the deposit dialog and the activity table's
  auto-completion.
- A transaction lifecycle state for a call that arrives bound and unpaid, and the relayer
  paying its fee.
- Serving the vault's prover keys to the browser.

Out of scope, per the brief:

- Every other operation (withdraw, swap, supply, redeem, approval). They keep building and
  proving on the backend and keep the browser's sign turn. Their code paths are touched only
  where a shared type changes shape, and their tests keep passing at every step.
- The caller secret. It keeps authenticating every server action exactly as today, and the
  server keeps deriving the caller, the deposit account and the recipient from it.
- Concurrency on the relayer wallet's DUST state. One relayer facade pays for every sponsored
  call and every relayer call. Double spends between two in-flight fee transactions are
  ignored.

## Target flow

1. Browser asks the server for the deposit's assigned fields (`prepareStartDeposit`): the
   deposit account, the slot `inIndex`, the EVM nonce, the sweep gas. Nothing is written.
2. Browser executes the `startDeposit` circuit with the caller secret as witness against the
   indexer (unproven bytes, never leave the page), proves it through the proof server (unbound
   bytes), has the connected wallet balance its own coins and sign and bind it without a fee
   (bound bytes).
3. Browser calls `startDeposit` with the request, the wallet keys, the assignment it built
   against and the bound bytes. The server re-derives every assigned field, refuses a nonce
   that moved, and in one database transaction stores the deposit in
   `AwaitingStartTransaction` and commits the call as a Midnight transaction in `AwaitingFee`.
4. The transaction resolver, on the `awaiting-fee` event or the sweep, has the relayer wallet
   attach a DUST fee (`AwaitingSubmission`), then submits (`AwaitingInclusion`) and watches
   (`Succeeded`). From here the deposit lifecycle is unchanged.
5. At `AwaitingCompletion` the browser asks for the completion's inputs
   (`prepareCompleteDeposit`: the request id and the attested output), builds, proves and binds
   the `completeDeposit` call the same way, and calls `completeDeposit` with the bound bytes.
   The server transitions the deposit and commits the call in `AwaitingFee` in one transaction.

What the browser never sends: unproven bytes (they embed the witness). What the server never
holds for a deposit: the circuit builder, the prover keys for the deposit circuits' proving,
the user's DUST.

## Design decisions

### D1. The fee is sponsored, not pre-paid by the user

The user's wallet balances with `tokenKindsToBalance: ['shielded', 'unshielded']`, signs and
binds. The relayer wallet runs `balanceFinalizedTransaction(tx, keys, { ttl,
tokenKindsToBalance: ['dust'] })`, `signRecipe`, `finalizeRecipe`. This is the wallet SDK's
documented DUST sponsorship flow. The user needs no DUST and no registered NIGHT.

Facts the design relies on, read from the installed SDK:

- `balanceUnboundTransaction` with nothing to balance does not throw for a contract call: the
  unshielded wallet returns the transaction itself when its segments are already balanced
  (`wallet-sdk-unshielded-wallet dist/v1/Transacting.js`, `#balanceUnboundishTransaction`), so
  the recipe holds the base transaction and no balancing transaction, and `finalizeRecipe` binds
  it.
- `Transaction.merge` refuses two transactions that both carry contract interactions
  (`ledger-v9.d.ts:2525`). The fee transaction carries none, so the merge is legal.
- The fee is taken in the guaranteed phase and not refunded on a fallible failure. The relayer
  pays for a deposit call that fails. Accepted for now: the sponsor is the application's own
  backend and the caller is authenticated.

### D2. A bound, unpaid call is a new transaction state, `AwaitingFee`

States name what the row waits for. A caller-built call waits for the relayer's fee. The row
gains a `boundTx` field (hex, the user-bound bytes) and the state machine gains:

| From          | Action                           | To                    |
| ------------- | -------------------------------- | --------------------- |
| `AwaitingFee` | `recordFee` (with `finalizedTx`) | `AwaitingSubmission`  |
| `AwaitingFee` | `expire`                         | `Failed` as `Expired` |

Field table: `AwaitingFee` holds `boundTx` and `expireTime` and nothing else. `unboundTx` stops
being required from `AwaitingSubmission` on (it is free there: set on the backend-proved path,
null on the browser-proved path). `boundTx` is free after `AwaitingFee`.

No new failure value. A `payFee` that throws is logged and retried by the sweep, and the TTL
ends the row as `Expired`, consistent with "an outcome nobody observed ends Expired".

### D3. The entry state follows the bytes committed

`commitTransaction` takes `CommittedCall = { unprovenTx: string } | { boundTx: string }` and
enters `AwaitingProof` or `AwaitingFee` accordingly. `INITIAL_STATE` becomes
`ENTRY_STATE_BY_CALL`, a two-entry table in the state machine. The AGENTS.md rule "a resource
has exactly one entry state" is amended to "one entry state per kind of committed call, the
table in the state machine", in the same step.

The relayer-built path (every permissionless circuit, and the other four operations' caller
calls) commits `{ unprovenTx }` and is unchanged.

### D4. The server assigns, the browser builds, the server verifies

The deposit's assigned fields stay server-decided. `prepareStartDeposit` returns them without
writing. `startDeposit` receives the two the browser baked into the call (`inIndex`,
`evmNonce`) and re-derives the rest: the deposit account from the caller, the recipient from the
wallet keys, the gas from the constant, and the nonce from the chain and the live deposits. A
nonce that no longer matches is refused with `DepositNonceConflict`, and the browser rebuilds.
No row is written before the call exists, so there are no orphan rows and no reserved nonces.

The server does not inspect the bound bytes to confirm they carry the claimed inputs. The vault
ledger is the acknowledgement of every step (`requestStage()` reads `inIndex` from the ledger),
so a browser that lies about its inputs only breaks its own deposit. This trust assumption is
written into the deposit service's doc comment.

### D5. The circuit builder becomes isomorphic, the deposit's half moves

`VaultCircuitsMidnightJsImpl.build()` needs no file system: the midnight-js call builder
resolves prover material through the ZK config provider by key location
(`contract:<address>/<circuit>?vk=<hash>`), and nothing in the installed midnight-js reads the
compiled contract's assets path. The one Node coupling is `withCompiledFileAssets` plus
`nodeZkConfigRegistry` in the composition root.

The shared mechanics (`build`, the call options, the public-keys wallet provider, the
no-recipient constant, the permissionless private state, `circuitAssertMessage`) move to an
isomorphic module. The deposit's two circuits' argument mapping moves with it. The backend
implementation keeps the other circuits and calls the shared mechanics. The browser gets a
deposit call builder that takes its providers as arguments.

### D6. Prover keys are served from `public/`

`@midnight-ntwrk/midnight-js-fetch-zk-config-provider@5.0.0-beta.6` (the installed midnight-js
version exists for it) fetches `keys/<circuit>.prover`, `keys/<circuit>.verifier`,
`zkir/<circuit>.bzkir` and the integrity manifest `compiler/contract-manifest.json` under a
base URL. That is exactly the layout `yarn zk-assets` writes under
`zk-assets/ethereum-erc20-vault/`, manifest included. A copy of that bundle under
`public/zk-assets/ethereum-erc20-vault/` (gitignored) serves the browser. The provider needs an
absolute http(s) base URL, built from `window.location.origin` at call time.

### D7. The browser proves through the configured proof server

`midnightNetwork.proofServerURL` is already in the client config and the browser wallet already
reaches it for its own balancing proofs. The browser's `httpClientProofProvider` uses the same
URL and the same fifteen-minute timeout the backend uses.

### D8. The wallet port gains one method, the relayer port gains one method

- `Wallet.balanceWithoutFee(unboundTx: string): Promise<string>`: balances the wallet's own
  coins, signs, binds, returns bound hex. `SeedWallet` implements it over the facade.
- `RelayerWallet.payFee(boundTx: string): Promise<string>`: attaches the relayer's DUST fee,
  returns finalised hex. `RelayerWalletSeedImpl` implements it over the facade.

Both ports keep `finalize` for the other operations.

### D9. What is deleted at the end

`VaultCircuits.startDeposit` and `completeDeposit` on the backend port and implementation, the
`circuits` and `unprovenTx` dependencies of the deposit service, the backend's `completionOutput`
helper (moves to the builder), the deposit arms of the activity flow dialog's sign turn, and
the "sign its start call" wording in the deposit toasts. `TransactionService.submitTransaction`,
`useWalletSigning` and `Wallet.finalize` stay: the other four operations use them.

## Naming

- Transaction state `AwaitingFee`, event `midnight.transaction-v1.awaiting-fee`, action
  `recordFee`, field `boundTx`, args `RecordFeeArgs { name, finalizedTx }`.
- `CommittedCall` in `transaction-state-controller.ts`, `ENTRY_STATE_BY_CALL` in
  `transaction-state-machine.ts`.
- Service methods: `prepareStartDeposit`, `startDeposit`, `prepareCompleteDeposit`,
  `completeDeposit`. Returned types `DepositStartInputs` and `DepositCompleteInputs` in
  `deposit.ts`. Error `DepositNonceConflict` in `deposit-service.ts`.
- Isomorphic modules: `src/lib/midnight/ethereum-erc20-vault/vault-call.ts` (shared mechanics
  and the deposit circuits' option builders) and
  `src/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-call-builder.ts` (`DepositCallBuilder`).
- `src/lib/midnight/private-state-provider-memory-impl.ts` is renamed
  `src/lib/midnight/memory-private-state-provider.ts`, class `MemoryPrivateStateProvider`: the
  `-impl.ts` suffix is backend-owned by the boundary script and the browser must import it.
- Script `zk-assets:public`.

None of the new browser-imported files may end in a backend suffix (`-impl.ts`,
`-circuits.ts`, `-ledger.ts`, `-state-controller.ts`, `-adaptor.ts`, and the rest of the list
in `scripts/check-boundaries.ts`). `vault-circuits.ts` and `transaction-ledger.ts` are
backend-owned, so the browser imports their types only.

## Gates

Every step ends with:

```bash
yarn check
```

which runs typecheck, lint, format check, the boundary script, the diagram library check and
the unit tests. A step that changes a class or a state regenerates the diagram library first:

```bash
yarn diagram-library
```

Integration tests run against the local stack with no dev server running
(`ps aux | grep "[n]ext dev"` finds nothing). One file:

```bash
yarn vitest run --config vitest.integration.config.ts --reporter=verbose <file>
```

The whole suite, required by the repository rules whenever a state machine, controller,
resolver, ledger, flusher, sweep or the composition root changes:

```bash
yarn test:integration
```

Steps 1, 5 and 7 change one of those, so they run the whole suite.

## Step 0: prove the sponsorship path with the real circuits

Goal: the deposit's two caller calls land on chain with the user wallet binding them unpaid and
the relayer wallet paying the DUST fee, before any lifecycle code changes. This step adds the
two port methods of D8 and uses them from the end-to-end test.

Changes:

- `src/lib/midnight/wallet/wallet.ts`: add `balanceWithoutFee`.
- `src/lib/midnight/wallet/seed-wallet-facade.ts`: add `bindWithoutFee(facade, keys,
unboundTx)` (balance `['shielded', 'unshielded']`, sign, finalise) and `payFee(facade, keys,
boundTx)` (deserialise as `FinalizedTransaction`, `balanceFinalizedTransaction` with
  `['dust']`, sign, finalise). Both return hex.
- `src/lib/midnight/wallet/seed-wallet.ts`: `balanceWithoutFee` over `bindWithoutFee`.
- `src/lib/midnight/wallet/relayer-wallet.ts` and `relayer-wallet-seed-impl.ts`: `payFee`,
  same start guard as `finalize`.
- `integration-tests/user-wallet.ts`: add `balanceWithoutFee` beside `balance` (the test
  helper rebuilds the facade itself, since integration tests import nothing from `src` at
  runtime).
- `integration-tests/ethereum-erc20-vault-deposit.test.ts`: `playWallet` does
  `user.balanceWithoutFee(unboundTx)`, then `backend.midnight.relayerWallet.payFee(boundTx)`,
  then `submitTransaction` with the result. The expected event trail is unchanged. The log line
  records both durations.

Tests: the end-to-end deposit file. It is the proof that the SDK path works with these circuit
calls, this node and this proof server. If it fails here, nothing further is built until the
cause is understood.

Gate: `yarn check`, then the end-to-end deposit file. The relayer must hold DUST on the local
stack, which it already must for flushes.

## Step 1: the `AwaitingFee` state and the relayer's fee step

Goal: a transaction can be committed bound and unpaid, and the resolver pays and submits it.
Nothing calls the new entry yet.

Changes:

- `src/lib/midnight/transaction-v1/transaction.ts`: `AwaitingFee` in
  `MIDNIGHT_TRANSACTION_STATES` between `AwaitingWallet` and `AwaitingSubmission`; `boundTx:
z.string().nullable()` after `unboundTx`, with its doc ("balanced and bound by the caller's
  wallet without a fee, what the relayer pays for"). The `signer` doc changes to "whose wallet
  balances and signs the call, and the relayer pays the fee of a bound commit".
- `transaction-state-machine.ts`: the transition row for `AwaitingFee`, `recordFee` in
  `TransactionAction`, `AwaitingFee` in `EXPIRABLE_STATES`, the field table per D2,
  `ENTRY_STATE_BY_CALL` replacing `INITIAL_STATE`, and `entryState(call: CommittedCall)`.
- `transaction-state-controller.ts`: `CommittedCall`, `CommitTransactionArgs` as the
  `Omit<...>` intersected with `CommittedCall`, `recordFee(args: RecordFeeArgs)`, the
  `AwaitingFee` event.
- `transaction-state-controller-impl.ts`: `commitTransaction` sets `state` from the call and
  fills the other bytes with null. `recordFee` is `transition(name, 'recordFee', {
finalizedTx })`.
- `transaction-state-resolver-impl.ts`: `resolveAwaitingFee` calls `relayerWallet.payFee`
  outside the transaction, then `write(() => recordFee(...))`. The `switch` gains the case.
- `transaction-fixtures.ts`: `TRANSACTION_IN_STATE.AwaitingFee`, and the later states' rows
  keep `unboundTx: 'unbound'` (the backend-proved shape) while one more fixture holds the
  browser-proved shape (`boundTx` set, `unboundTx` null) for the controller test.
- `transaction-repository-sql-impl.ts` and `src/lib/db/schema.ts`: the `bound_tx` text column.
  Migration `drizzle/0010_transaction_bound_tx.sql` from `yarn db:generate`, applied with `yarn
db:migrate`.
- `src/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress.ts`: `signingStep` is
  unchanged in behaviour (`AwaitingFee` falls after the signing step), and its comment says so.
- README "Midnight transactions": the state list, the `boundTx` field, the fee step, the
  sponsorship paragraph. AGENTS.md: the entry-state rule per D3, the state list in the ledger
  bullet.
- `yarn diagram-library`.

Unit tests:

- `transaction-state-machine.test.ts`: every `(state, action)` pair including the new ones,
  `assertConsistent` over the new fixtures, `entryState` for both call kinds.
- `transaction-state-controller-impl.test.ts`: commit with `boundTx` enters `AwaitingFee` and
  publishes `awaiting-fee`; `recordFee` from `AwaitingFee` and refused from every other state.
- `transaction-state-resolver-impl.test.ts`: `AwaitingFee` calls `payFee` with the bound bytes
  and records the result. `payFee` throwing records nothing and surfaces. Expiry from
  `AwaitingFee`.

Integration: `integration-tests/midnight-transaction-resolve.test.ts` gains a second test:
commit a bound empty transaction (`Transaction.fromParts(networkId).mockProve()` serialised),
resolve, expect `AwaitingSubmission` with `finalizedTx` set and the trail `awaiting-fee`,
`awaiting-submission`. It stops before submission.

Gate: `yarn check`, then `yarn test:integration` (state machine, controller and resolver
changed). The other operations' integration files must pass unchanged: their transactions never
enter `AwaitingFee`.

## Step 2: the caller-operation controller commits either kind of call

Goal: a caller operation can commit its start and complete calls as unproven or as bound,
without any service using the bound form yet.

Changes:

- `caller-operation-state-controller.ts`: `CompleteOperationArgs` becomes `{ name } &
CommittedCall`.
- `caller-operation-state-controller-impl.ts`: `start(row, circuit, call: CommittedCall)` and
  `complete({ name, ...call })` spread the call into `commitTransaction`.
- `deposit-state-controller.ts` and `deposit-state-controller-impl.ts`: `StartDepositArgs`
  carries `call: CommittedCall` in place of `unprovenTx`. The other four operations'
  `Start<X>Args` do the same, so the base controller has one signature. Their services pass
  `call: { unprovenTx }`, a one-line change each, behaviour unchanged.
- Unit tests of the five state controllers and of the five services: fixtures build `call: {
unprovenTx: '...' }`. The deposit controller test adds one case committing `{ boundTx }` and
  asserting the child is created in `AwaitingFee`.

Gate: `yarn check`. The integration suite is unaffected in behaviour. Run the deposit-start
file as a smoke test.

## Step 3: hoist the call mechanics into an isomorphic module

Goal: the backend's circuit implementation and a future browser builder share one `build`.
Behaviour unchanged.

Changes:

- Rename `private-state-provider-memory-impl.ts` to `memory-private-state-provider.ts`, class
  `MemoryPrivateStateProvider`, drop `server-only`. Grep the old path and class name across the
  repository and update every hit (the impl, backend.ts, tests, README).
- New `src/lib/midnight/ethereum-erc20-vault/vault-call.ts` (isomorphic, no `server-only`):
  `buildVaultCall(providers, privateState, wallet, options)` (the body of today's `build`
  minus the logger line, which the caller keeps), `vaultCallOptions(compiledContract,
vaultAddress, circuit, args)`, `walletProviderOf`, `NO_RECIPIENT`,
  `permissionlessVaultPrivateState`, `circuitAssertMessage` (moved out of `vault-circuits.ts`,
  which is backend-owned), and the two option builders `startDepositCallOptions(args)` and
  `completeDepositCallOptions(args)`, with `StartDepositCircuitArgs` and
  `CompleteDepositCircuitArgs` moved here from `vault-circuits.ts` (type-only re-exported
  there until step 5 deletes the port methods).
- `vault-circuits-midnight-js-impl.ts`: every method calls `vaultCallOptions` and
  `buildVaultCall`; `startDeposit` and `completeDeposit` call the option builders.
  `compiledVaultContract(assetsPath)` stays here, since it is the file-assets binding.
- The deposit service adaptor imports `circuitAssertMessage` from the new module.

Unit tests: none of the moved code has unit tests today (it is SDK-bound). The impl's existing
tests, if any, keep passing. The move is covered by the deposit-start integration file and the
flush file, which exercise `build` through the backend.

Gate: `yarn check` (the boundary script must accept the new module from both sides), then the
deposit-start and flush integration files.

## Step 4: the browser deposit call builder and the served prover keys

Goal: a module that, given providers and the caller secret, produces the unbound bytes of a
deposit call, tested in Node against the local stack through the Node ZK registry. The browser
does not use it yet.

Changes:

- Add `@midnight-ntwrk/midnight-js-fetch-zk-config-provider@5.0.0-beta.6` to `package.json`
  with the lockfile. Its real consumer arrives in step 6, but its presence is checked here by
  typing the browser factory below.
- New `src/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-call-builder.ts`:
  `DepositCallBuilder` constructed from `{ publicDataProvider, zkConfigProvider, proofProvider,
compiledContract, vaultAddress }`, with `buildStart(args): Promise<string>` and
  `buildComplete(args): Promise<string>` returning unbound hex (execute through
  `buildVaultCall`, then prove through `proofProvider.proveTx`). The args are the circuit args
  of step 3 plus `secretKey: Uint8Array` and `wallet: WalletPublicKeys`. The complete arguments
  are built from `DepositCompleteInputs` (step 5 defines the type, so for this step the builder
  takes the circuit args directly). `completionOutput` moves here from the deposit service.
- New `src/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-call-providers.ts`: the
  browser factory `browserDepositCallProviders(config)` returning the provider set over
  `indexerPublicDataProvider`, `FetchZkConfigProvider(`${origin}/zk-assets/ethereum-erc20-vault`)`,
  `httpClientProofProvider` with the fifteen-minute timeout, and the compiled contract bound
  with `withCompiledFileAssets('/zk-assets/ethereum-erc20-vault')`. If typing shows the assets
  binding is not required by `createCallTxOptions` (its parameter is `CompiledContract<C,
any>`), drop the binding and say so in the module doc. The file is isomorphic in type but
  reads `window.location.origin`, so it is imported only from components.
- `package.json` script `zk-assets:public`: copies `zk-assets/ethereum-erc20-vault` to
  `public/zk-assets/ethereum-erc20-vault` with `rsync -a --delete`, run verbatim once before
  documenting it. `.gitignore` gains `public/zk-assets`. README "Proving keys" documents the
  copy and that the browser fetches keys from the page's own origin.
- `src/lib/midnight/ethereum-erc20-vault/vault-circuits-midnight-js-impl.ts`: nothing.

Tests:

- Unit: `deposit-call-builder.test.ts` with mocked providers is low value, since the SDK does
  the work. One table-driven test covers `completionOutput` (executed output bytes, the single
  zero byte otherwise) and the argument mapping of `buildComplete`.
- Integration: new `integration-tests/ethereum-erc20-vault-deposit-call-builder.test.ts`:
  build the backend, construct `DepositCallBuilder` from the backend's `publicDataProvider`,
  the Node registry over `zk-assets/`, the backend's proof provider and compiled contract
  (exposed on `MidnightBackend['ethereumErc20Vault']` as `compiledContract` and
  `zkConfigProvider`, which the circuits implementation already receives), with a fresh caller
  secret and the user wallet's keys, assign `inIndex` and a nonce of zero, and assert the
  unbound hex deserialises as `Transaction<SignatureEnabled, Proof, PreBinding>`. Nothing is
  submitted and no row is written, so the ledger sees nothing. This test imports the builder
  from `src`, which the boundary rule for integration tests forbids ("nothing but
  `getBackend()`"), so the builder is reached through a new `Backend` field instead:
  `midnight.ethereumErc20Vault.depositV1.callBuilder`, built in the composition root from the
  same providers. That field is what step 5's integration tests use too.

Gate: `yarn check`, then the new integration file.

## Step 5: the deposit API takes bound calls

Goal: the deposit service no longer builds anything. This is the cut-over for the deposit. The
end-to-end test plays the browser by building in process.

Changes:

- `deposit.ts`: `depositStartInputsSchema` (`depositAccount`, `inIndex`, `evmNonce`,
  `gasLimit`, `maxFeePerGas`, `maxPriorityFeePerGas`, `recipient`) and
  `depositCompleteInputsSchema` (`requestId`, `attestationOutputKind`, `attestationOutput`),
  with their types. Both are what a circuit takes, named as the deposit's inputs.
- `deposit-service.ts`: the interface per the target flow. `startDepositArgsSchema` becomes
  `{ depositRequest, wallet, inIndex: uint64Schema, evmNonce: uint64Schema, boundTx:
hexBytesSchema }`, `completeDepositArgsSchema` becomes `{ name, wallet, boundTx }`,
  `prepareStartDepositArgsSchema` is `{ depositRequest, wallet }` and
  `prepareCompleteDepositArgsSchema` is `{ name, wallet }`. `DepositNonceConflict` beside
  `DepositRecipientMismatch`.
- `deposit-service-impl.ts`: drop `circuits`. `prepareStartDeposit` assigns as today's
  `startDeposit` did and returns the inputs. `startDeposit` re-derives, compares `evmNonce`,
  then runs the controller call in one transaction with `call: { boundTx }`.
  `prepareCompleteDeposit` does today's pre-checks (state table, recipient) and returns the
  attested request's fields. `completeDeposit` repeats the pre-checks and transitions with
  `call: { boundTx }`. The doc comment states D4's trust assumption.
- `deposit-service-adaptor.ts` and `src/server/actions/deposit-actions.ts`: the two prepare
  methods, `DepositStartInputsResult` and `DepositCompleteInputsResult` result types.
  `DepositNonceConflict` is an `ok: false` outcome.
- `vault-circuits.ts` and `vault-circuits-midnight-js-impl.ts`: delete `startDeposit` and
  `completeDeposit`. No callers remain, and the vault-circuits fixtures and the five service
  tests that mock them are updated. The backend keeps `sendDeposit`.
- `src/server/backend.ts`: `DepositServiceImpl` without circuits.
- README "ERC-20 vault deposit API" and "Deposit lifecycle" steps 1, 2 and 6: the browser
  builds and proves, the relayer pays.
- `yarn diagram-library`.

Unit tests:

- `deposit-service-impl.test.ts`: prepare returns the assignment. Start with a matching nonce
  commits a bound call. Start with a stale nonce refuses and writes nothing. Complete with a
  wallet whose recipient differs from the stored one refuses. Prepare-complete on a deposit
  not in `AwaitingCompletion` refuses.
- `deposit-service-adaptor.test.ts`: the new schemas and the conflict result.
- The deposit controller test is unchanged from step 2.

Integration:

- `ethereum-erc20-vault-deposit-start.test.ts`: prepare, build through the backend's
  `callBuilder` with the user wallet's keys, `user.balanceWithoutFee`, `startDeposit`, expect
  the deposit in `AwaitingStartTransaction` and its child in `AwaitingFee`, resolve the child
  once, expect `AwaitingSubmission` with `finalizedTx` set. A second test starts with a nonce
  one below the assignment and expects the conflict. Nothing is submitted.
- `ethereum-erc20-vault-deposit.test.ts`: the start and the complete go through prepare,
  `callBuilder`, `balanceWithoutFee` and the bound commit, and the relayer pays inside the
  backend. `playWallet` is deleted: the user has no sign turn. The expected trail becomes, for
  both calls, `awaiting-fee`, `awaiting-submission`, `awaiting-inclusion`, `succeeded`. The
  complete retry loop calls prepare and build again on each retry.
- `operation-round-trip.ts` and the other four operations' files: unchanged and must pass.

Gate: `yarn check`, then `yarn test:integration`.

## Step 6: the browser does it

Goal: the deposit dialog and the auto-completion build, prove and bind in the page.

Changes:

- `src/components/deposit-dialog.tsx`: the mutation becomes prepare, dynamic-import the builder
  and providers (as the wallet SDK is loaded, so visitors who never deposit never download the
  compact runtime and the contract), build, prove, `wallet.balanceWithoutFee`, `startDeposit`.
  On `DepositNonceConflict` the mutation retries once from prepare. The busy state covers the
  whole run, and the status line reports which stage runs ("building the start call", "proving
  the start call", "signing with your wallet", "recording the deposit"), rendered with `role`
  `status`. The toast drops "sign its start call from the Activity row".
- `src/components/activity-section.tsx`: `useAutoCompletion` for `Deposit` runs prepare,
  build, prove, bind and `completeDeposit`. The other types keep calling their complete
  actions. `COMPLETE_BY_TYPE` splits into the deposit's browser-built completion and the
  record of the four server-built ones, named for what they are. The toast changes to
  "Completing your deposit: it is proved and signed, and the backend is submitting it."
- `src/components/activity-flow-dialog.tsx`: the description for a deposit in progress names
  the fee step. The sign turn never fires for a deposit, since its transactions never enter
  `AwaitingWallet`. The step labels of `activity-progress.ts` are checked against the new
  trail.
- Run `yarn zk-assets:public` and start the dev server.

Verification in the real browser (the built-in browser pane, a fresh tab per reload-dependent
check):

1. Log in with a caller, connect the funded seed wallet, open the deposit dialog, fund the
   deposit account through the local faucet, deposit. Watch the status line through the four
   stages, the proof server log, and the activity row reach `Pending` with the start
   transaction's hash.
2. Read the network panel: no request carries unproven bytes, the key and ZKIR fetches hit
   `/zk-assets/ethereum-erc20-vault/...` with the manifest, and the proof server receives the
   circuit proofs from the page.
3. Wait for `AwaitingCompletion`. The completion runs without a click and the row reaches
   `Complete` with outcome `minted`.
4. Disconnect the wallet mid-proof: the mutation fails with the wallet error and nothing is
   written (check the deposits table).
5. Keyboard: the deposit button stays disabled while busy, the dialog cannot close while busy,
   focus returns to the trigger after.
6. Narrow layout and dark theme for the status line.
7. The other operations: run one withdraw or swap through the UI to confirm the sign turn still
   appears and works for them.

Then stop the dev server and run the end-to-end deposit file once more, since the dev server
shares the Kafka consumer group with the test backend (memory note).

Gate: `yarn check`, the browser evidence above, then the end-to-end deposit file.

## Step 7: delete what the deposit no longer needs and settle the docs

Changes:

- Delete the deposit arms of `CIRCUIT_LABELS` in the flow dialog only if nothing renders them,
  and keep them otherwise. Delete `useWalletSigning`'s deposit-specific wording if any.
- Grep for `unprovenTx` across `src/components` and the deposit modules: none may remain.
- Grep for the marker words in every touched comment (previously, no longer, instead of, rather
  than, old, now) and rewrite.
- README: the "Proving keys" section says proving happens in the browser for the deposit and on
  the backend for the rest, lists `yarn zk-assets:public`, and the environment table notes the
  proof server must be reachable from the browser's host. The "Midnight wallet" section
  documents `balanceWithoutFee`. The "Testing" tables gain the two new integration files.
- `docs/deposit-flow-upgrade.drawio` is brought in line with what was built (the relayer's fee
  step was not in the sketch) and rendered to its `.drawio.png` pair, linted with
  `drawio-cli lint` and `drawio-cli check-pair`.
- `yarn diagram-library`.

Gate: `yarn check`, then `yarn test:integration` one last time, since the composition root
changed across the steps.

## Risks and how each step contains them

| Risk                                                               | Where it surfaces | Containment                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SDK sponsorship path fails with these circuits or this node    | Step 0            | Nothing else is built until it passes.                                                                                                                                                                |
| `balanceWithoutFee` throws on a call with nothing to balance       | Step 0            | The unshielded wallet returns the transaction when balanced, read from the installed source. If it throws anyway, `bindWithoutFee` falls back to `Transaction.bind()` and the fallback is documented. |
| `FetchZkConfigProvider` rejects the bundle's manifest              | Step 6            | The bundle ships `compiler/contract-manifest.json`, which is the file the provider looks for. The provider's `verify: 'warn'` option is the escape hatch, documented as a local-only setting.         |
| The compiled contract needs the file-assets binding in the browser | Step 4            | Type the factory first. The binding is a string nothing reads, per the midnight-js source.                                                                                                            |
| Bundle size                                                        | Step 6            | Dynamic import of the builder, providers, contract and compact runtime, like the wallet SDK.                                                                                                          |
| The relayer's TTL versus the user's TTL                            | Step 1            | Both intents carry their own TTL, and the row's `expireTime` stays the server's one hour. A follow-up may read the TTL out of the bound bytes.                                                        |
| A nonce race between two deposits of one caller                    | Step 5            | Refused at commit, the browser rebuilds once.                                                                                                                                                         |
| The relayer pays for a failing call                                | Step 0 onward     | Accepted, see D1.                                                                                                                                                                                     |

## What this plan does not decide

- Reading the user's TTL out of the bound bytes for `expireTime`.
- Moving the other four operations. Each will reuse `vault-call.ts`, `balanceWithoutFee`,
  `payFee`, `AwaitingFee` and the `CommittedCall` union as they are, and will need its own
  prepare methods and call builder. When the second builder appears, the shared part of
  `DepositCallBuilder` is hoisted then, not before.
- Replacing the caller secret as the authentication credential.
