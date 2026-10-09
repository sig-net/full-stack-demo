# Stage 3 report: the Ethereum transaction entity

Worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
`bernard/rebuild`. The tree is uncommitted.

## What was built

New under `src/lib/ethereum/transaction-v1/`:

- `transaction-state-machine.ts`: `nextState` over `TRANSITIONS`, `TransactionAction`
  (`recordSubmission`, `recordSuccess`, `recordFailure`, `expire`), `COMMITTABLE_STATES`
  (`['AwaitingSubmission']`), `EXPIRABLE_STATES` (both waiting states), `assertConsistent` over
  `FIELDS_BY_STATE` (`txHash` set from `AwaitingInclusion`, `blockNumber` set on `Succeeded`,
  `failure` set on `Failed`, `blockNumber` and `error` free on `Failed`, `expireTime` never
  required).
- `transaction-state-controller.ts`: `EthereumTransactionStateController` (`commitTransaction`,
  `recordSubmission`, `recordSuccess`, `recordFailure`, `expireTransaction`), the args interfaces,
  `EthereumTransactionStateConflict`, `ethereumTransactionEventDataSchema` (`{ name, parent }`),
  `ETHEREUM_TRANSACTION_EVENT_BY_STATE` (`ethereum.transaction-v1.awaiting-submission`,
  `.awaiting-inclusion`, `.succeeded`, `.failed`), `ETHEREUM_TRANSACTION_EVENTS`.
- `transaction-state-controller-impl.ts`: `EthereumTransactionStateControllerImpl` in the
  Midnight shape. Commit validates `COMMITTABLE_STATES` and consistency, and every transition
  locks the row, patches, asserts, updates and publishes.
- `transaction-ledger.ts`: `EthereumTransactionLedger` (`broadcast(signedTx)`,
  `status({ txHash, from, nonce })`), `LedgerStatusArgs`, `EthereumLedgerTransactionStatus`
  (`pending` | `mined` | `reverted` | `nonceConsumed`).
- `transaction-ledger-ethers-impl.ts`: `EthereumTransactionLedgerEthersImpl` over an ethers
  `Provider` passed in by the composition root. `broadcast` checks the receipt, then
  `broadcastTransaction`, swallowing ethers `NONCE_EXPIRED` and the "already known", "already
  imported", "alreadyknown", "nonce too low" messages. `status` reads the transaction count
  first and the receipt only when the count passed the nonce (see the ethers finding below).
- `transaction-state-resolver.ts` and `transaction-state-resolver-impl.ts`:
  `EthereumTransactionStateResolver(Impl)`. Expiry first, `AwaitingSubmission` broadcasts and
  records the hash or `Rejected` with the message, `AwaitingInclusion` derives `from` and `nonce`
  with `ethers.Transaction.from(signedTx)` and maps the status. One `runInTransaction` per
  transition, the conflict swallowed.
- `transaction-event-consumer.ts`: `EthereumTransactionEventConsumer`.
- `transaction-fixtures.ts`: `transactionFixture`, `TRANSACTION_IN_STATE`, `CALLER_NAME`,
  `VAULT_REQUEST_NAME`, `TRANSACTION_NAME`, and a real signed transaction (`SIGNED_TRANSACTION`,
  `SIGNED_TX`, `TX_HASH`) built synchronously with `SigningKey` so the resolver can parse it.
- Tests: `transaction-state-machine.test.ts`, `transaction-state-controller-impl.test.ts`,
  `transaction-state-resolver-impl.test.ts`, `transaction-event-consumer.test.ts`,
  `transaction-ledger-ethers-impl.test.ts` (the ledger over a `mock<Provider>` with real
  `TransactionReceipt` instances). 76 tests.

Changed:

- `transaction.ts`: states `AwaitingSubmission`, `AwaitingInclusion`, `Succeeded`, `Failed`,
  failures `Rejected`, `Reverted`, `NonceConsumed`, `Expired`, `unsignedTx` dropped, `signedTx`
  required and validated as `0x` lower-case hex, `txHash` validated as a 32-byte `0x` hash,
  `blockNumber: bigint | null`, `expireTime: Date | null`, `failure` and `error` added.
- `transaction-repository-sql-impl.ts`: mappers follow the new fields.
- `src/lib/db/schema.ts`: `signed_tx NOT NULL`, `block_number bigint`, `expire_time`, `failure`,
  `unsigned_tx` dropped. Migration `drizzle/0010_ethereum_transaction_lifecycle.sql` with the
  journal tag matching and `drizzle/meta/0010_snapshot.json`.
- `src/server/backend.ts`: `EthereumBackend.transactionV1 = { repository, stateController,
ledger, stateResolver, eventConsumer }`, `createEthereum(db, event, config)` building the
  provider as `new JsonRpcProvider(rpcURL, undefined, { cacheTimeout: -1 })`.
- `src/server/start.ts`: registers `ethereum.transactionV1.eventConsumer`.
- `integration-tests/ethereum-transaction-broadcast.test.ts`: the two cases the hand-off asked
  for (a transfer mined to `Succeeded` with its three lifecycle events, and a second transaction
  at the consumed nonce ending `Failed` as `NonceConsumed` with its three events).
- `README.md`: an "Ethereum transactions" section before "Composition", and the layout table row.
- `docs/deposit-build-plan.md`: Stage 3 text corrected to the names and the status read order
  as built, all eight boxes ticked, six findings appended.
- Midnight identifiers qualified (see the naming decision): every file under
  `src/lib/midnight/transaction-v1/`, `src/server/backend.ts`, the two Midnight integration
  tests, `README.md`, `docs/deposit-build-plan.md`, one line in `AGENTS.md`, one label in
  `docs/architecture.drawio`.
- Two copied doc comments in the Midnight controller files were edited alongside their Ethereum
  copies: the "rather than" sentence in `transition` cut to its load-bearing clause, and a prose
  semicolon in the controller interface doc replaced with a colon.

Not changed: `scripts/check-boundaries.ts`. Every new file ends in a suffix the guard already
owns (`-impl.ts`, `-repository.ts`, `-state-controller.ts`, `-state-machine.ts`,
`-state-resolver.ts`, `-event-consumer.ts`, `-ledger.ts`, `-fixtures.ts`), so no planted
violation was needed. `yarn boundaries` reports 171 files and 98 backend imports checked.

## Verification, with the observed output

- `yarn typecheck`: four `TS6133` errors, all in
  `src/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller-impl.ts` (lines 13,
  14, 21, 25). `git diff --quiet HEAD -- <that file>` confirms it is untouched. Nothing else.
- `yarn lint`: two `eslint(no-unused-vars)` errors and zero warnings, both in the same untouched
  file (lines 21:16 and 25:23). Exit code 1 before and after this stage. No diagnostic in any
  Stage 3 file.
- `yarn format` then `yarn format:check`: "All matched files use the correct format. Finished in
  224ms on 193 files using 12 threads."
- `yarn boundaries`: "Boundaries hold across 171 files (98 backend imports checked)".
- `yarn test`: "Test Files 12 passed (12), Tests 193 passed (193)", 76 of them the new Ethereum
  files, rerun after the final comment edits with the same counts.
- `yarn test:integration` with no dev server running (`ps aux | grep "[n]ext dev"` empty):
  "Test Files 4 passed (4), Tests 8 passed (8), Duration 7.87s". The Ethereum file alone was run
  five times in total: one failure on the first ledger shape (below), then four passes.
- Migration: `yarn db:migrate` printed "migrations applied successfully", and
  `docker compose exec -T postgres psql -U demo -d demo -c '\d ethereum_transactions_v1'` shows
  `signed_tx text not null`, `block_number bigint`, `expire_time timestamp with time zone`,
  `failure text`, no `unsigned_tx`, and the `ethereum_transactions_v1_live` partial unique index
  intact. `drizzle.__drizzle_migrations` holds row 11 for it.
- `yarn check` itself stops at typecheck on the pre-existing errors, as the pack says.

## Where the pack was wrong, missing or ambiguous

- "Three pre-existing TS6133 errors": there are four. `yarn lint` also fails on that file (two
  errors), which the pack does not mention. It says only typecheck fails.
- "mirror the Midnight ones exactly (`TransactionStateConflict` ...)": the Ethereum entity
  cannot reuse the Midnight entity's unqualified names in `backend.ts` without typing qualified
  twins, which the binding rules forbid unless the incumbents are qualified too. See the decision
  below.
- The ledger `status` shape differs between the plan (`status(txHash, from, nonce: bigint)`) and
  the pack (`status(args: { txHash, from, nonce: bigint })`). The pack's shape was used, with
  `nonce: number`.
- "re-check the receipt once more before concluding, the prep code explains why": the re-check
  is what fails under ethers (below). The prep code's reason is a `waitForTransaction` window
  edge that the resolver, which polls, does not have.
- `yarn db:generate` is interactive when a column is dropped and others added in the same
  table: it prompts "created or renamed from another column?" per added column and hangs
  without a TTY. The pack's workflow does not say so. I drove it through a Python `pty` script
  (stdlib) answering Enter per prompt. The script is in the session scratchpad, not the repo.
- The hand-off's integration sketch says "anvil mines every second, so wait or poll": true,
  `anvil_getIntervalMining` is 1 and `anvil_getAutomine` is false. The fork's base fee is a
  few wei, so the R5 envelope (30 gwei, 1 gwei priority) is included on the next block.
- The pack says `.scratch-spike/` holds two spikes to copy from, and it does. Two new probes
  were added there (`spike-anvil-receipt.mts`, `spike-anvil-receipt-order.mts`). The folder is
  gitignored.

## Decisions that deviate from the plan, and why

1. Midnight identifiers qualified. Writing `EthereumTransactionStateController` beside
   `TransactionStateController` in `backend.ts` is the trigger of the qualified-twin rule, so in
   the same change the Midnight entity's shared identifiers became
   `MidnightTransactionStateController(Impl)`, `MidnightTransactionStateConflict`,
   `MidnightTransactionLedger`, `MidnightTransactionLedgerImpl` (class only, the file stays
   `transaction-ledger-midnight-impl.ts`), `MidnightLedgerTransactionStatus`,
   `MidnightTransactionStateResolver(Impl)`, `MidnightTransactionEventConsumer`,
   `MIDNIGHT_TRANSACTION_EVENT_BY_STATE`, `MIDNIGHT_TRANSACTION_EVENTS`,
   `midnightTransactionEventDataSchema`, `MidnightTransactionEventData`. Folder-private names
   (`nextState`, `assertConsistent`, `COMMITTABLE_STATES`, `EXPIRABLE_STATES`,
   `TransactionAction`, the `*Args` interfaces, `transactionFixture`, `TRANSACTION_IN_STATE`,
   `TRANSACTION_NAME`) stay unqualified in both folders, since no file imports both. A
   whole-repository grep for the bare names afterwards finds one hit, `docs/diagramming.md:57`
   (`TransactionLedger` as an example code label), which is the user's untracked work in
   progress and was left for them.
2. `status` reads the count first and the receipt once. The prep shape (receipt, count, receipt
   again) failed the integration test on its first run: the row went `Failed` after
   `AwaitingInclusion`. `.scratch-spike/spike-anvil-receipt-order.mts` showed ethers'
   `AbstractProvider` 250 ms request cache answering `getTransactionReceipt` with a stale `null`
   while the raw `eth_getTransactionReceipt` already had the receipt, and showed anvil never
   serving the count ahead of the receipt. The backend's provider is also built with
   `cacheTimeout: -1`, so an event nudge arriving within 250 ms of `broadcast`'s own null
   receipt read cannot be answered stale either (an automine chain would hit that).
3. `nonce` is a `number` in the ledger port (ethers' type for both the transaction nonce and
   the count). `blockNumber` is a `bigint` on the row (Postgres `bigint`, drizzle
   `mode: 'bigint'`).
4. `RecordFailureArgs.error` and `.blockNumber` are optional: `Rejected` carries the node's
   message, `Reverted` carries its block, `NonceConsumed` carries neither.
5. `signedTx` and `txHash` are validated by regex (`0x` lower-case hex, and `0x` plus 64 hex
   digits) in the resource schema, inline, since they are the resource's own formats. The
   Midnight resource validates nothing on its bytes.
6. The ledger implementation takes an ethers `Provider` through its constructor (construction in
   `createEthereum`), so its unit test runs over `mock<Provider>` with real `TransactionReceipt`
   instances. The pack's "one `JsonRpcProvider(rpcURL)` per impl instance" holds, built at the
   root.
7. `Expired` on an Ethereum transaction means the backend stopped waiting, and the chain may
   still include it (an EIP-1559 transaction has no TTL). The resource doc says so.

## What the Stage 4 agent must know

- Commit shape. Inside `unitOfWork.runInTransaction`, call
  `backend.ethereum.transactionV1.stateController.commitTransaction({ transaction })` with:

  ```ts
  {
    name: `${caller}/ethereum-transactions/${uuid}`,   // ethereumTransactionName(callerName, uuid)
    parent: vaultRequestName,                           // any non-empty string; the live index is per parent
    state: 'AwaitingSubmission',
    signedTx: transaction.serialized,                   // ethers Transaction from the MPC signature, 0x lower-case hex
    txHash: null, blockNumber: null,
    expireTime: null | Date,                            // optional; null means never expire
    failure: null, error: null,
    createTime: now, updateTime: now,                   // overwritten by the controller
  }
  ```

  `txHash` must be null on commit (the state table refuses it). The MPC's signed bytes from the
  prep `pollSignatureResponse` are an ethers `Transaction`, so store `.serialized`.

- One live child per parent: the partial unique index `ethereum_transactions_v1_live` refuses a
  second non-terminal row for the same `parent`, so commit a retry only after the previous child
  is `Succeeded` or `Failed`.
- Reading the child's terminal state: `repository.search({ criteria: [{ type: 'exact-text',
field: 'parent', text: vaultRequestName }], order: { field: 'createTime', direction: 'desc' },
limit: 1 })`, then `state`, `failure`, `txHash`, `blockNumber`. The terminal events are
  `ethereum.transaction-v1.succeeded` and `ethereum.transaction-v1.failed`, data
  `{ name, parent }`, so the vault request consumer can match on the parent's collection without
  a read and call its own resolver with the parent name.
- Failure semantics for the parent's resolver. `Rejected`: the node refused, which includes a
  transport failure at broadcast time, so the row is terminal and the parent re-observes the
  ledger before deciding whether to retry. `Reverted`: on chain, gas paid, call not applied,
  `blockNumber` set. `NonceConsumed`: another transaction holds the nonce, so the chain, not
  this row, says what happened to the request. `Expired`: the backend gave up, and the chain may
  still include the bytes. As the plan says, never read a child's failure as the request's
  failure: read the ledger.
- The resolver needs nothing beyond the row: `from` and `nonce` come from
  `ethers.Transaction.from(signedTx)`.
- Re-broadcasting the same bytes is safe: `broadcast` checks the receipt first and swallows the
  already-known family, so a duplicate child for an already-mined transaction ends `Succeeded`
  through the status read, and a duplicate at a nonce another transaction took ends
  `NonceConsumed`.
- ethers: `JsonRpcProvider` caches identical requests for 250 ms unless built with
  `cacheTimeout: -1`, which the backend's one is. Build any further provider the same way if it
  feeds a decision. `broadcastTransaction` makes three RPC calls (block number, network, send)
  and throws when the node's hash differs from the locally computed one.
- anvil: a second raw transaction at a used nonce answers "nonce too low" (ethers code
  `NONCE_EXPIRED`), `anvil_setBalance` funds a fresh account instantly, a block arrives every
  second, and `eth_getTransactionReceipt` and `eth_getTransactionCount('latest')` flip together.
- `Backend` placement: the ledger is `backend.ethereum.transactionV1.ledger`, as the Stage 3
  hand-off placed it, while the Stage 7 sketch in the plan draws `ethereum.ledger` one level up.
  Stage 7 can move it if it wants the sketch literal.
- `yarn lint` currently fails on the deposit placeholder file. A green lint needs the user's
  placeholder parameters prefixed with `_` or the methods implemented (Stage 6).
