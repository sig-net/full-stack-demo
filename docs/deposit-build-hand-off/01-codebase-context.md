# Codebase context

What the code expects, as realised in the model entity `src/lib/midnight/transaction-v1` and
its twin `src/lib/ethereum/transaction-v1`. When in doubt, open the matching file there and
copy its shape. Shared identifiers of both are qualified (`MidnightTransactionStateController`,
`EthereumTransactionLedger`, `MIDNIGHT_TRANSACTION_EVENT_BY_STATE`, and so on), while
folder-private names (`nextState`, `assertConsistent`, `COMMITTABLE_STATES`, the `*Args`
interfaces, `transactionFixture`) stay bare. The exported Midnight names today:
`MidnightTransactionStateController(Impl)`, `MidnightTransactionStateConflict`,
`MidnightTransactionLedger`, `MidnightTransactionLedgerImpl` (file
`transaction-ledger-midnight-impl.ts`), `MidnightLedgerTransactionStatus`,
`MidnightTransactionStateResolver(Impl)`, `MidnightTransactionEventConsumer`,
`MIDNIGHT_TRANSACTION_EVENT_BY_STATE`, `MIDNIGHT_TRANSACTION_EVENTS`,
`midnightTransactionEventDataSchema`. The Ethereum ones follow with the `Ethereum` prefix.

## The lifecycle entity pattern, file by file

Every resource with a lifecycle has these files under `src/lib/<chain>/<resource>-v1/`:

| File                                   | Holds                                                                                                                                                                                                                                                                                                                                | Model                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `transaction.ts`                       | zod schema and type, name format and builder, collection constant, `STATES`, `TERMINAL_STATES`, `FAILURES` as `as const` arrays with `z.enum` schemas                                                                                                                                                                                | `midnight/transaction-v1/transaction.ts` |
| `transaction-repository.ts`            | `export type XRepository = Repository<X>`, nothing else                                                                                                                                                                                                                                                                              | same folder                              |
| `transaction-repository-sql-impl.ts`   | `class extends SQLRepository<X, typeof table>` with two row mappers that convert values and never rename                                                                                                                                                                                                                             | same                                     |
| `transaction-state-machine.ts`         | `nextState(state, action)` over a `TRANSITIONS` table, the `Action` union, `COMMITTABLE_STATES`, `EXPIRABLE_STATES`, `assertConsistent(x)` over a `FIELDS_BY_STATE` table of `set` and `unset` fields                                                                                                                                | same                                     |
| `transaction-state-controller.ts`      | the interface (one method per action, `commitX` first), one `XArgs` interface per method, the `XStateConflict` error class, `xEventDataSchema = z.object({ name, parent })`, `X_EVENT_BY_STATE` (one `defineEvent('<chain>.<resource>-v1.<kebab-state>', schema)` per state), `X_EVENTS`                                             | same                                     |
| `transaction-state-controller-impl.ts` | `commit` validates `COMMITTABLE_STATES` and `assertConsistent`, creates, publishes. Every other method is `this.transition(name, action, patch)`: `search` with `lock: 'update'` on the name, `nextState` or throw the conflict, patch, `assertConsistent`, `update`, publish the event of the state entered with `{ name, parent }` | same                                     |
| `transaction-ledger.ts`                | the port to the slow external system, with a discriminated status union                                                                                                                                                                                                                                                              | same                                     |
| `transaction-ledger-<system>-impl.ts`  | the implementation                                                                                                                                                                                                                                                                                                                   | `transaction-ledger-midnight-impl.ts`    |
| `transaction-state-resolver.ts`        | `resolveX({ name })` interface and args                                                                                                                                                                                                                                                                                              | same                                     |
| `transaction-state-resolver-impl.ts`   | `get` outside any transaction, expire first when past `expireTime` and in `EXPIRABLE_STATES`, `switch` on the state with an exhaustive `default: never`, slow call then one `write(() => controller.action(...))` where `write` is `unitOfWork.runInTransaction` swallowing the conflict error                                       | same                                     |
| `transaction-event-consumer.ts`        | `wantsEvent` matches the definitions, `handleEvent` `safeParse`s the data and calls the resolver, throwing on malformed data                                                                                                                                                                                                         | same                                     |
| `transaction-fixtures.ts`              | `xFixture(overrides)`, `X_IN_STATE` per state, shared names, dates in the past                                                                                                                                                                                                                                                       | same                                     |
| `*.test.ts`                            | table-driven vitest, see Testing                                                                                                                                                                                                                                                                                                     | same                                     |

Controllers never open a database transaction. Resolvers open exactly one per transition.
Nothing slow runs inside it.

## Golden repository

`src/lib/repository/repository.ts`:

```ts
interface Repository<Resource> { create(r); get(name); update(r); search(args) }
SearchArgs = { criteria: Criterion[]; order?: { field; direction: 'asc' | 'desc' }; limit?: number; lock?: 'update' | 'update-skip-locked' }
Criterion = { type: 'exact-text'; field; text } | { type: 'bool'; field; bool }
```

A query a resource needs is expressed through `search`. A need no `SearchArgs` can express
extends `SearchArgs` for every resource, never one repository. Repositories are tested against
Postgres (`integration-tests/repository-sql.test.ts`), never mocked.

## Unit of work and write boundaries

`src/lib/db/unit-of-work.ts`: `unitOfWork.runInTransaction(work)` over AsyncLocalStorage, every
repository call on the chain joins it. Write boundaries: an adaptor method that creates, updates
or starts something, a resolver's single transition, the outbox batch. Reads run on the plain
database.

## Events

`src/lib/event/event.ts`: `defineEvent(type, dataSchema)` gives `{ type, create(key, data),
matches(event), parse(event) }`. Lifecycle events only, one per state entered, keyed by the
resource name, data `{ name, parent }` for a child resource. Publishing writes an outbox row in
the open transaction. The outbox processor relays to Kafka (`full-stack-demo.events`), and the
consumer hub (`src/lib/event/event-consumer-hub-impl.ts`) dispatches to registered consumers
outside any transaction, redelivering after a failed handler.

Lesson from Stage 2: a change to an event's data shape is a change to events already on the
topic. A consumer that rejects a record stalls every consumer (the hub restarts on the same
uncommitted record). Add fields as optional or publish under a new type. If the local topic
holds stale records, with the server stopped:

```bash
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group full-stack-demo.events --topic full-stack-demo.events --reset-offsets --to-latest --execute
```

## Testing

Unit tests live beside the code, table driven:

```ts
const cases: Case[] = [{ name, stored, ledger: { status: async () => ({ outcome: 'pending' }) }, expectTransitions: [...] }, ...]
test.each(cases)('$name', async ({ ... }) => { ... })
```

Doubles come from `mock<Interface>(name, methods)` in `src/lib/testing/mock.ts`: the methods
supplied answer, anything else throws `X.method was called but the test did not expect it`.
Assertions on what a method received go inside the method. The resolver test records
transitions through a `recording(method)` helper and counts `runInTransaction` calls. The
controller test checks the lock taken (`locks` array), the row written and the event published.
`MemoryRepository` (`src/lib/repository/repository-memory-impl.ts`) is the in-memory fake for
flow tests.

Integration tests live only under `integration-tests/`, run with their own vitest config,
`setup.ts` loads `.env.local`, `backend.ts` gives `testBackend()` (`getBackend()`) and
`uniqueCallerName()`. A test file deletes its own rows in `afterAll` and ends the pool. They
import nothing from `src` at runtime but `getBackend` (the boundary guard enforces it). Packages
and `ethers` may be imported directly.

## Boundary guard

`scripts/check-boundaries.ts`. Backend-owned: `src/lib/db/`, `event/`, `kafka/`,
`repository/`, `testing/`, `lazy-singleton.ts`, `resolve-caller.ts`, and every file ending in
`-impl.ts`, `-repository.ts`, `-state-controller.ts`, `-state-machine.ts`,
`-state-resolver.ts`, `-event-consumer.ts`, `-ledger.ts`, `-circuits.ts`, `relayer-wallet.ts`,
`-adaptor.ts`, `-fixtures.ts`. Runtime imports of those are allowed only from the backend,
`src/server`, `integration-tests` and unit tests. Type-only imports cross freely. A new
backend-owned file kind means a new suffix in the list plus a planted violation seen failing.

## Composition root

`src/server/backend.ts`: `createBackend(config)` builds packages in dependency order
(`db`, `kafka`, `event`, `ethereum`, `midnight`), each by one function receiving only earlier
packages. `getBackend()` memoises per module graph. `src/server/start.ts` registers consumers,
starts the hub and the outbox relay and the relayer wallet. Actions under `src/server/actions`
are one-liners reaching an adaptor through `getBackend()`. Nothing in `src/lib` constructs
anything.

Current `Backend` shape (abridged):

```ts
{ config, start(), stop(), db: { pool, database, unitOfWork }, kafka: { createConsumer, producer, publisher }, event: { publisher, consumerHub, outboxEntryV1 },
  ethereum: { provider /* ethers JsonRpcProvider, cache off */, transactionV1: { repository, stateController, ledger, stateResolver, eventConsumer } },
  midnight: { relayerWallet, publicDataProvider,
    transactionV1: { repository, stateController, ledger, stateResolver, eventConsumer, service, adaptor },
    ethereumErc20Vault: { circuits, ledger, signetReaders, respondOutcomeSources, flusher, flushEventConsumer,
      vaultRequestV1: { repository, stateController, stateResolver, eventConsumer },
      depositV1: { repository, stateController, stateResolver, eventConsumer, service, adaptor } } } }
```

Inside `createMidnightTransactionV1` the proof provider is a `lazySingleton(async () =>
httpClientProofProvider({ url, zkConfigProvider: await nodeZkConfigRegistry(root), timeout }))`,
a function returning `Promise<ProofProvider>`. Inside `createMidnightEthereumErc20Vault` a
`NodeZkConfigProvider<VaultCircuitId>` over `zk-assets/ethereum-erc20-vault` and the compiled
contract from `compiledVaultContract(assetsPath)` (exported by
`vault-circuits-midnight-js-impl.ts`) are built and handed to the circuits impl. Neither is
on the `Backend` object yet.

Other modules Stage 4 added under `src/lib/midnight/ethereum-erc20-vault/`: `vault-action.ts`
(`VAULT_ACTIONS`, `VaultAction`, kept free of SDK imports so `drizzle-kit` can load the schema
through its CommonJS loader), `signet-readers.ts` (`SignetReaders`, one
`SignetRequestResponseReader` per action), `respond-outcome-source.ts` with its two impls,
`vault-ledger-fixtures.ts` (`ledgerMap` for fake ledger maps), and in `vault-ledger.ts` the
`RequestLedger` port (six maps plus `mpcResponseKey`) that `VaultLedger` extends. The
`drizzle-kit` constraint: `src/lib/db/schema.ts` must not reach `@sig-net/midnight` or the
contract package at runtime, so resource files the schema imports stay free of them.
`src/lib/value-schemas.ts` now also has `hex32BytesSchema` and `evmBytesSchema`.

`config.client` holds `midnightNetwork` (indexer, node and proof server URLs), `midnightSignet`
(`contractAddress`, `mpcRootPublicKey`), `midnightEthereumErc20Vault` (`contractAddress`),
`ethereum` (`chainId`, `rpcURL`). `config.serverOnly` holds `midnightProver.zkAssetsRoot`,
`midnightRelayer.seed`, `midnightRespondOutput` (`source`: `evm-node` | `mpc-cache`,
`mpcOutputCacheURL`).

## Migrations

`src/lib/db/schema.ts` is the schema. Contract integers are `numeric(39,0)` read as bigint
(`contractInteger()` helper). Partial unique indexes use
`.where(notInArray(table.state, [...TERMINAL]).inlineParams())`. Workflow: edit the schema,
`yarn db:generate`, rename `drizzle/NNNN_<random>.sql` to a descriptive name and change the
`tag` in `drizzle/meta/_journal.json` to match, `yarn db:migrate`, verify with psql. A
`NOT NULL` column added to a table with rows needs a default in the SQL (then drop it) or the
rows deleted first. Constraint names are explicit (Postgres truncates at 63 characters).

## The vault request entity (Stage 4)

`src/lib/midnight/ethereum-erc20-vault/vault-request-v1/`: states `AwaitingFlush`,
`AwaitingSend`, `AwaitingSignature`, `AwaitingBroadcast`, `AwaitingAttestation`,
`AwaitingAttestationQueue`, `AwaitingAttestationFlush`, `Attested` (terminal, no failure
state). Events `midnight.ethereum-erc20-vault.vault-request-v1.<kebab-state>` with
`{ name, parent }`. The resolver `VaultRequestStateResolver` has `resolveVaultRequest({ name })`,
`resolveWaitingFlushes()` (the two awaiting-flush states, one ledger read, conflicts swallowed
per row, other failures logged per row) and `resolvePending()` (every non-terminal row). The
row is a cache of the ledger: `requestStage()` decides every chain step, a child's outcome never
does. The controller's `startSend`, `startBroadcast` and `startAttestationQueue` commit a child
under the row's lock and map a Postgres `23505` to `VaultRequestStateConflict`.

## The flusher (Stage 5)

`src/lib/midnight/ethereum-erc20-vault/flusher.ts` and `flusher-impl.ts`:
`FlusherImpl(runFlush, onFlushed)` runs one flush at a time, runs again on a lost race (a
`CallTxFailedError` with status `FailFallible`, or a plain `Error` whose message is
`failed assert: Request not queued`, `Identical request open` or `Attestation not queued`),
logs and stops on any other error, and after a flush that filled slots calls `onFlushed`
(`resolveWaitingFlushes`) and runs again. `FlushEventConsumer` wants the vault request events
`awaiting-flush` and `awaiting-attestation-flush` and awaits `flush()`, which holds the hub for
the run. The composition root builds the SDK provider set lazily on the first flush
(`createVaultProviders`), shares the proof provider across packages, and exposes
`ethereumErc20Vault.flusher` and `.flushEventConsumer`. `RelayerWallet.provider()` starts the
wallet when nothing has.

## The deposit entity (Stage 6)

`src/lib/midnight/ethereum-erc20-vault/deposit-v1/`: states `AwaitingStartTransaction`,
`AwaitingVaultRequest`, `AwaitingCompletion`, `AwaitingCompleteTransaction`, `Completed`
(with `outcome` `minted` or `closed`), `Failed` (`StartFailed`). `DepositService` has
`startDeposit(caller, { depositRequest, wallet })`, `completeDeposit(caller, { name, wallet })`,
`getDeposit`, `listDeposits`, where `wallet` is the browser wallet's coin and encryption public
keys as 64-hex strings. The service does the slow build and the chain nonce read first and
opens the transaction itself for the write, so the adaptor wraps nothing. The adaptor maps
`DepositStateConflict` and the contract's `failed assert: <message>` errors to `{ ok: false }`.
Server actions: `startDeposit`, `completeDeposit`, `getDeposit`, `listDeposits` in
`src/server/actions/deposit-actions.ts`. `integration-tests/user-wallet.ts` has
`userWalletPublicKeys(seedHex)` built from the SDK packages. `isUniqueViolation` lives in
`src/lib/db/unique-violation.ts` and `callerOf` in `src/lib/caller/caller.ts`.

## Lifecycle and sweep (Stage 7)

`Backend` has `start()` (once per instance: starts the relayer wallet, registers the five
consumers, runs the hub loop, the outbox relay and the sweep under one `AbortController`) and
`stop()` (aborts, waits up to 30 s for the loops, closes the Kafka producer, now exposed as
`kafka.producer`). `src/server/start.ts` is `(await getBackend()).start()`. The sweep
(`src/lib/sweep.ts`) runs every 30 s: `resolvePending()` on the Midnight transaction, Ethereum
transaction, vault request and deposit resolvers, then fires the flusher without awaiting it.
The flush consumer also fires `flush()` without awaiting. `delayUnlessAborted` in
`src/lib/delay-unless-aborted.ts` is the shared abort-aware delay. From a test: `start()` in
`beforeAll`, and in `afterAll` delete rows, `stop()`, then `pool.end()`, in that order. A
single integration file shows console output only with `--reporter=verbose`.

## Committing a child transaction from a parent's controller

Midnight, inside the caller's unit of work:

```ts
midnightTransactionStateController.commitTransaction({
  transaction: {
    name: midnightTransactionName(callerName, randomUUID()),
    parent,
    state: 'AwaitingProof',
    circuit: 'sendDeposit',
    signer: 'relayer',
    unprovenTx,
    unboundTx: null,
    finalizedTx: null,
    expireTime,
    txId: null,
    failure: null,
    error: null,
    createTime: now,
    updateTime: now,
  },
})
```

Ethereum, same place:

```ts
ethereumTransactionStateController.commitTransaction({
  transaction: {
    name: ethereumTransactionName(callerName, randomUUID()),
    parent,
    state: 'AwaitingSubmission',
    signedTx /* 0x lower-case hex, ethers Transaction.serialized */,
    txHash: null,
    blockNumber: null,
    expireTime: null | Date,
    failure: null,
    error: null,
    createTime: now,
    updateTime: now,
  },
})
```

Both tables have a partial unique index allowing one non-terminal row per `parent` (Midnight:
per `parent` and `circuit`). A second live child throws a unique violation from Postgres, which
the parent's controller maps to its own conflict error. A parent finds its latest child with
`search({ criteria: [{ type: 'exact-text', field: 'parent', text: parentName }], order: { field:
'createTime', direction: 'desc' }, limit: 1 })` (add a `circuit` criterion for Midnight). The
children's terminal events are `<chain>.transaction-v1.succeeded` and `.failed` with data
`{ name, parent }`. Never read a child's failure as the parent's failure: re-observe the ledger.

Ethereum failure semantics: `Rejected` (the node refused, transport failures included),
`Reverted` (on chain, gas paid, `blockNumber` set), `NonceConsumed` (another transaction holds
the nonce), `Expired` (the backend gave up, the chain may still include it). Re-broadcasting the
same bytes is safe.

## Stack facts

- `EVM_RPC_URL` in `.env.local` is anvil 1.5.1 forking Sepolia, chain id 11155111, block time
  one second, cheatcodes available (`anvil_setBalance`, `anvil_setStorageAt`,
  `anvil_impersonateAccount`). `debug_traceTransaction` works.
- `ethers@6.17.0` is a direct dependency. `JsonRpcProvider` caches identical requests for
  250 ms unless built with `cacheTimeout: -1`, which the backend's provider is
  (`backend.ethereum.transactionV1.ledger` wraps it). Build any further provider the same way
  when its answer feeds a decision. `Transaction.from(hex)` gives `hash`, `from`, `nonce`.
- anvil mines a block every second (interval mining, automine off), the fork's base fee is a
  few wei, a second raw transaction at a used nonce answers "nonce too low" (ethers code
  `NONCE_EXPIRED`), and `eth_getTransactionReceipt` and `eth_getTransactionCount('latest')`
  flip together.
- Seeds: `MIDNIGHT_RELAYER_SEED` and `MIDNIGHT_USER_SEED` in `.env.local` are harness-funded
  wallets of the stack.
- The vault allows Circle USDC (`CIRCLE_USDC` from the contract package), Aave USDC and EURC.
