# Stage 6 report: the deposit entity, its services and actions

Worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
`bernard/rebuild`, tree left uncommitted. `yarn check` is green end to end for the first time
since the deposit placeholder was committed.

## What was built

Under `src/lib/midnight/ethereum-erc20-vault/deposit-v1/`:

| File                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deposit.ts`                                                  | Reshaped resource: `DEPOSIT_STATES` (`AwaitingStartTransaction`, `AwaitingVaultRequest`, `AwaitingCompletion`, `AwaitingCompleteTransaction`, `Completed`, `Failed`), `DEPOSIT_TERMINAL_STATES`, `DEPOSIT_FAILURES` (`StartFailed`), `DEPOSIT_OUTCOMES` (`minted`, `closed`), new fields `depositAccount`, `outcome`, `failure`, `error`, `createTime`, `updateTime`. Free of the Midnight packages.                                                                                                                                                                              |
| `deposit-repository-sql-impl.ts`                              | Row mappers carry the six new fields.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `deposit-state-machine.ts`                                    | New: `nextState` over `recordStarted`, `recordStartFailure`, `recordAttested`, `complete`, `recordCompleted`, `recordCompleteFailure`; `COMMITTABLE_STATES`; `assertConsistent` (`outcome` only on `Completed`, `failure` only on `Failed`, `error` free on `Failed`).                                                                                                                                                                                                                                                                                                            |
| `deposit-state-controller.ts`                                 | Replaced the draft: `startDeposit({ deposit, unprovenTx })`, `recordStarted`, `recordStartFailure`, `recordAttested`, `completeDeposit({ name, unprovenTx })`, `recordCompleted({ name, outcome })`, `recordCompleteFailure`, `DepositStateConflict`, `depositEventDataSchema = { name }`, `DEPOSIT_EVENT_BY_STATE` (`midnight.ethereum-erc20-vault.deposit-v1.<kebab-state>`), `DEPOSIT_EVENTS`.                                                                                                                                                                                 |
| `deposit-state-controller-impl.ts`                            | Replaced the throwing placeholders. `startDeposit` creates the row, publishes, commits the caller's `startDeposit` transaction (signer `caller`, `AwaitingProof`, one-hour TTL, named under the caller). `recordStarted` transitions, then `VaultRequestStateController.queueRequest` with `{ parent, action: 'deposit', inIndex, depositAccount }`. `completeDeposit` transitions and commits the `completeDeposit` transaction. A child's unique violation maps to `DepositStateConflict`.                                                                                      |
| `deposit-service.ts`                                          | `startDeposit(caller, { depositRequest, wallet })`, `completeDeposit(caller, { name, wallet })`, `getDeposit`, `listDeposits(caller, {})`; `walletPublicKeysSchema` (two 32-byte hex keys) and the four args schemas.                                                                                                                                                                                                                                                                                                                                                             |
| `deposit-service-impl.ts`                                     | Assigns `inIndex` (`newInputIndex()`), `depositAccount` (`deriveEvmAddress` over the caller's `userCommitment`), `evmNonce` (max of the chain's pending count and one above the caller's live deposits), the gas envelope `SWEEP_GAS`; builds the call, then opens the transaction. `completeDeposit` requires ownership and `AwaitingCompletion`, finds the `Attested` child request, builds with the attested output or one zero byte, then opens the transaction. Takes an ethers `Provider`, the `UnitOfWork`, `MidnightSignetConfig` and `MidnightEthereumErc20VaultConfig`. |
| `deposit-service-adaptor.ts`                                  | Gains `completeDeposit` and `listDeposits` (`DepositListResult`); drops the `UnitOfWork`; maps `DepositStateConflict` and `failed assert: ...` build errors to `{ ok: false }`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `deposit-state-resolver.ts`, `deposit-state-resolver-impl.ts` | New: `resolveDeposit({ name })` per state (start transaction `Succeeded`/`Failed`, vault request `Attested`, complete transaction `Succeeded`/`Failed` with the outcome from the request's attestation) and `resolvePending()`. One `runInTransaction` per transition, conflicts swallowed.                                                                                                                                                                                                                                                                                       |
| `deposit-event-consumer.ts`                                   | New: wants the deposit's own events, Midnight transaction terminal events and the vault request `attested` event whose `parent` is a deposit name.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `deposit-fixtures.ts`                                         | New: `depositFixture`, `DEPOSIT_IN_STATE`, shared names and values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `*.test.ts`                                                   | New, table driven: state machine (36 pairs + 11), controller (4 start cases, 6 transitions, 3 refusals, 3 child-error cases), service (5 nonce cases, 3 output cases, 5 refusals, reads), resolver (21 cases + 2 sweeps), consumer (13), adaptor (8 parsing + 4 outcomes).                                                                                                                                                                                                                                                                                                        |

Elsewhere:

- `src/lib/db/unique-violation.ts` (new): `isUniqueViolation`, hoisted from the vault request controller at its second consumer.
- `src/lib/caller/caller.ts`: `callerOf(resourceName)`, hoisted likewise.
- `src/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller-impl.ts`: imports both hoisted helpers, otherwise unchanged.
- `src/lib/db/schema.ts`: the six columns and an index on `deposit_account`.
- `drizzle/0012_deposit_lifecycle.sql`, `drizzle/meta/0012_snapshot.json`, `drizzle/meta/_journal.json` (tag `0012_deposit_lifecycle`).
- `src/server/backend.ts`: `depositV1` gains `stateResolver` and `eventConsumer`; `createMidnightEthereumErc20VaultDepositV1` takes the Ethereum package, the config, the transaction package, the vault request package and the circuits.
- `src/server/start.ts`: registers `depositV1.eventConsumer` (five consumers now).
- `src/server/actions/deposit-actions.ts`: `completeDeposit` and `listDeposits` one-liners.
- `integration-tests/user-wallet.ts` (new): `userWalletPublicKeys(seedHex)` and `userWalletSeed()`.
- `integration-tests/ethereum-erc20-vault-deposit-start.test.ts` (new): four tests, see below.
- `integration-tests/repository-sql.test.ts`: the deposit fixture and the raw insert carry the new columns.
- `README.md`: the "ERC-20 vault deposit API" section rewritten (states table, server-assigned fields, the two user actions and what the browser supplies, the write boundary).
- `docs/deposit-build-plan.md`: Stage 6's ten boxes ticked, ten findings appended.
- `.scratch-spike/spike-deposit-account.mts`, `.scratch-spike/spike-deposit-refusal.mts` (gitignored).

## Verification, with the observed output

- Deposit account derivation (`NODE_OPTIONS=--conditions=react-server node_modules/.bin/tsx --env-file=.env.local .scratch-spike/spike-deposit-account.mts`):

  ```text
  secret bytes 32
  commitment bytes 32
  derived           0x811841e671de49953cDBb09608932Db0Ec7F8335
  EVM_USER_ADDRESS  0x811841e671de49953cDBb09608932Db0Ec7F8335
  match true
  vault address matches prep true
  coinPublicKey string 64 true
  encryptionPublicKey string 64 true
  ```

- Migration: `yarn db:generate` wrote `0012_mighty_argent.sql` without prompting (six `ADD COLUMN`
  statements and one `CREATE INDEX`), renamed to `0012_deposit_lifecycle.sql` with the journal tag
  updated. `yarn db:migrate` printed `migrations applied successfully!`, and
  `docker compose exec -T postgres psql -U demo -d demo -c '\d midnight_ethereum_erc20_vault_deposits_v1'`
  shows 15 columns (`deposit_account text not null`, `outcome`, `failure`, `error`,
  `create_time`/`update_time timestamp with time zone not null`) and the index
  `midnight_ethereum_erc20_vault_deposits_v1_deposit_account btree (deposit_account)`;
  `drizzle.__drizzle_migrations` holds id 13 for it. The table held 0 rows before the migration.
- `yarn check`, after `yarn format` ("Finished in 691ms on 238 files"): typecheck
  `✓ Types generated successfully` with no `error TS` lines; `yarn lint` exit 0 with nothing
  reported (one `no-unnecessary-type-parameters` warning appeared on the first run in the adaptor
  test and was fixed); `yarn format:check` "All matched files use the correct format"; `yarn
boundaries` "Boundaries hold across 216 files (204 backend imports checked)"; `yarn test`
  "Test Files 27 passed (27), Tests 524 passed (524)" in 1.51 s (389 before the stage).
- `yarn test:integration` with `ps aux | grep "[n]ext dev"` returning nothing: "Test Files 7
  passed (7), Tests 18 passed (18), Duration 13.20s". The new file:
  1. `startDeposit` through the adaptor with a random caller secret and the user wallet's keys
     stores the deposit (`AwaitingStartTransaction`, `evmNonce 0n` for a fresh account, the gas
     envelope, a `0x`-prefixed lower-case `depositAccount`) and a Midnight transaction in
     `AwaitingProof` with signer `caller`, circuit `startDeposit`, hex `unprovenTx` and a TTL
     about an hour out.
  2. `transactionV1.stateResolver.resolveTransaction` proves it to `AwaitingWallet` through the
     proof server, and the outbox holds, in order, the deposit's `awaiting-start-transaction`,
     the transaction's `awaiting-proof` and `awaiting-wallet`.
  3. `listDeposits` returns the deposit, `getDeposit` returns it, and `completeDeposit` answers
     `{ ok: false, error: '<name> is AwaitingStartTransaction, which does not allow completeDeposit' }`.
  4. `startDeposit` with `0xab..ab` as the token answers `{ ok: false, error: 'failed assert: ...' }`
     and the caller's rows are unchanged. The exact message, from
     `.scratch-spike/spike-deposit-refusal.mts`: `failed assert: ERC20 not allowed`, in 291 ms.
- Invalidated names (`Starting`, `AwaitingEVM`, `resolveDepositState`, `ResolveDepositStateArgs`,
  the adaptor's second constructor argument): the only remaining hit is the plan's Stage 9 bullet
  that lists them as documentation cleanup targets. `docs/architecture.md` names none of them.
- Punctuation and history-marker sweep over every file touched: no em or en dashes, no prose
  semicolons in comments, no sentence starting with "Because", no "previously", "no longer",
  "instead of" or "rather than" in code comments. The plan's findings entry says the adaptor "no
  longer takes a `UnitOfWork`", which is a dated log of the change, and the README keeps its
  pre-existing "server actions rather than HTTP routes" sentence in human prose.

## Where the pack was wrong, missing or ambiguous

- `00-START-HERE.md` lists `timeout` as if available; macOS has no `timeout`, so `yarn db:generate`
  ran under the tool's own timeout. Also `${PIPESTATUS}` is bash: the user's shell is zsh
  (`$pipestatus`, and `$FILES` is not word-split without `${=FILES}`).
- The plan's Stage 6 controller sketch (`startDeposit({ caller, name, depositRequest, assigned,
unprovenTx })`) and the task file (`startDeposit({ deposit, unprovenTx })`) disagree. The task
  file's shape was built: the service assembles the whole `Deposit` and the controller validates
  it the way `commitTransaction` and `queueRequest` do.
- The task lists the `serializedOutput` and `outcome` rules under the service's tests, but the
  outcome is recorded by the resolver (the plan's `outcomeOf(request)`), so the outcome rule is
  tested in the resolver (four cases) and the output rule in the service (three cases).
- The task says the wallet keys are "validated by a hex schema" without a length. The spike
  established 64 lower-case hex characters for both, so the schema pins 32 bytes.
- The task names `yarn lint` output as evidence; oxlint prints nothing on success here, so the
  evidence is the exit code.
- `isUniqueViolation` was to go to `src/lib/db/unique-violation.ts`: done. `callerOf` was not
  mentioned but had the same second consumer, so it was hoisted to `src/lib/caller/caller.ts`.
- The README's previous text called the caller id "the depositor's 64-character hex identity
  commitment"; it is the application's SHA-256 caller id, independent of the contract's
  commitment (as `docs/architecture.md` says), and the rewrite says so.
- Nothing in the pack says what message a disallowed token produces; it is
  `failed assert: ERC20 not allowed`, now in the findings.

## Decisions that deviate from the plan, and why

- Write boundary (recorded in the findings): the service opens its own transaction after the
  build, and the adaptor takes no `UnitOfWork`. The plan offered two alternatives (build inside
  the adaptor's transaction with an `AGENTS.md` exception, or build in the adaptor); the task file
  had settled on the service owning it, which keeps the adaptor a pure translator and lets the
  service unit test pin the order.
- Nonce search (recorded): `exact-text` on `depositAccount` plus a code filter on terminal
  states, rather than one search per non-terminal state. One query, and the same criterion
  serves `listDeposits`, so the table gained an index on `deposit_account`. The caller's deposits
  are not found by name prefix (`SearchArgs` has no prefix criterion and adding one would extend
  it for every resource).
- `listDeposits` derives the deposit account from the caller secret to search by it. A deposit
  has no `parent` field (the plan's resource has none), and the account is a pure function of
  the secret per vault, so it stands in for the caller.
- The deposit's `awaiting-start-transaction` event is published before the child transaction is
  committed, so the parent's event precedes the child's in the outbox. Either order is correct
  for the consumers (the deposit resolver finds a live child and does nothing).
- The adaptor maps `failed assert: ...` build errors to `{ ok: false }`. The task did not ask for
  it; the Stage 5 report flagged that the service can turn an assert into a validation outcome,
  and the integration test shows it is the vault refusing the token.
- `resolvePending()` exists on the deposit resolver even though the task only named
  `resolveDeposit`, since Stage 7's sweep calls it on every resolver.
- A start transaction that fails for any reason (including `Expired`) ends the deposit
  `Failed`/`StartFailed`: the backend cannot rebuild a caller call, and a new deposit is the
  user's retry. The plan's sketch said the same.

## What the Stage 7 agent (composition, start-up and the sweep) must know

- Consumers to register, all built on the backend object: `midnight.transactionV1.eventConsumer`,
  `ethereum.transactionV1.eventConsumer`,
  `midnight.ethereumErc20Vault.vaultRequestV1.eventConsumer`,
  `midnight.ethereumErc20Vault.flushEventConsumer` and
  `midnight.ethereumErc20Vault.depositV1.eventConsumer`. `src/server/start.ts` already registers
  all five; Stage 7 moves that into `backend.start()`.
- `resolvePending()` exists on `VaultRequestStateResolver` and `DepositStateResolver` only. The
  Midnight and Ethereum transaction resolvers have `resolveTransaction({ name })` alone, so the
  sweep's expiry coverage for them is still to be built (`EXPIRABLE_STATES` and `expireTime` are
  there; what is missing is a search over waiting rows and a loop, as the vault request resolver's
  `resolveEach` does). Also `resolveWaitingFlushes()` on the vault request resolver is called by
  the flusher's `onFlushed`.
- The flush consumer `await`s `flush()` on purpose (Stage 5 findings): the hub commits the Kafka
  record only after every handler returns, so a rejected flush is redelivered. The cost is that
  every consumer waits for the flush's whole run (proving, balancing, inclusion: minutes). Since
  `FlusherImpl` coalesces (`runAgain`) and the sweep calls `flush()` every 30 s anyway, a
  `void flusher.flush().catch(log)` in the consumer would lose nothing a sweep does not recover
  and would stop one flush from stalling the deposit and transaction consumers behind it. The
  Stage 5 finding chose the await for the demo; Stage 7 should decide with the sweep in hand.
- `DepositServiceImpl` takes `ethereum.provider` (the ethers `Provider` with `cacheTimeout: -1`)
  for `getTransactionCount(account, 'pending')`. The plan's Stage 7 `Backend` sketch drops
  `ethereum.provider` in favour of `ethereum.ledger`; keep the provider reachable or add a nonce
  read to `EthereumTransactionLedger`.
- `createMidnightEthereumErc20VaultDepositV1` needs `circuits`, `vaultRequestV1`,
  `transactionV1`, `ethereum` and `config`, so it is built last inside
  `createMidnightEthereumErc20Vault`.
- Surprises: building a `startDeposit` call for a fresh random caller against the running stack
  took 291 ms warm, and a contract assert arrives as a plain `Error` with the message
  `failed assert: ERC20 not allowed`, exactly as Stage 5 found for the flush asserts. Nothing in
  `createUnprovenCallTx` needs the deposit account funded, so the start leg of the integration
  test needs no anvil cheatcodes; Stage 8's end-to-end run does.
- Two `startDeposit` calls by the same caller racing can draw the same `evmNonce`, since the
  nonce search runs outside the transaction. The vault request resolver's
  `AwaitingAttestationQueue` guard logs that case. If Stage 8's test starts deposits concurrently
  for one caller, expect it.
- The deposit's children are found by `parent` = deposit name: the Midnight transactions with
  `circuit` `startDeposit` or `completeDeposit` (signer `caller`), and the vault request
  (`action: 'deposit'`). The browser's to-do after each user action is the newest transaction
  under the deposit in `AwaitingWallet`, through `listTransactions({ parent })`.
