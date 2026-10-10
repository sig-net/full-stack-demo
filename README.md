# Full stack demo

A sig.network demonstration application, built with Next.js (App Router), React, Tailwind CSS
and shadcn/ui components on Base UI.

## Requirements

- Node.js 22.22 or newer.
- Yarn 4, supplied by Corepack from the `packageManager` field in `package.json`. Run
  `corepack enable` once if `yarn --version` does not report 4.x inside this folder.
- Docker with the Compose plugin, for the local Postgres database and Kafka broker.

## Getting started

```bash
yarn install
```

```bash
cp .env.example .env.local
```

```bash
docker compose up -d --wait
```

```bash
yarn db:migrate
```

```bash
yarn dev
```

The development server listens on http://localhost:3000. The variables in `.env.local` are
described under [Configuration](#configuration), and Postgres and Kafka under
[Local services](#local-services).

## Scripts

| Script                       | Purpose                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `yarn dev`                   | Start the development server.                                                                                                   |
| `yarn build`                 | Create a production build.                                                                                                      |
| `yarn start`                 | Serve the production build.                                                                                                     |
| `yarn typecheck`             | Generate the Next.js route types, then type check with `tsc`.                                                                   |
| `yarn lint`                  | Lint with oxlint, including its type-aware rules.                                                                               |
| `yarn format`                | Format with oxfmt.                                                                                                              |
| `yarn format:check`          | Report files that are not formatted.                                                                                            |
| `yarn test`                  | Run the unit tests once.                                                                                                        |
| `yarn test:integration`      | Run the integration tests against the local services.                                                                           |
| `yarn boundaries`            | Fail on a runtime import that crosses the backend boundary.                                                                     |
| `yarn diagram-library`       | Regenerate `docs/diagram-library.drawio` from the code (see `docs/diagramming.md`).                                             |
| `yarn diagram-library:check` | Fail when `docs/diagram-library.drawio` differs from a fresh generation.                                                        |
| `yarn check`                 | Run the type check, the linter, the format check, the boundary check, the diagram library check and the unit tests in sequence. |
| `yarn db:generate`           | Write a SQL migration for the changes made to the schema.                                                                       |
| `yarn db:migrate`            | Apply the migrations that the database has not yet run.                                                                         |
| `yarn zk-assets`             | Build the prover keys and ZKIR of the vault and signet contracts under `zk-assets/` (see [Proving keys](#proving-keys)).        |

## Layout

| Path                                                     | Contents                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`                                                | App Router files: the root layout, `error`, `global-error`, `not-found`, `icon.svg`, global CSS.                                                                                  |
| `src/app/(configured)`                                   | Routes that render inside `ConfigProvider`, gated by its layout: `/` and `/design`.                                                                                               |
| `src/components`                                         | Application React components.                                                                                                                                                     |
| `src/components/ui`                                      | Components written by the shadcn CLI.                                                                                                                                             |
| `src/components/contexts`                                | React contexts: each file holds a context, its provider and its `use<Name>` hook.                                                                                                 |
| `src/lib`                                                | Non-React modules. The files at its root serve every domain: `value-schemas.ts`, `lazy-singleton.ts`, `sweep.ts`, `delay-unless-aborted.ts`, `message-of.ts`.                     |
| `src/lib/caller`                                         | The caller secret and caller name schemas (`caller.ts`, shared with the browser) and the server's `resolveCaller()`.                                                              |
| `src/lib/config`                                         | Server configuration loading and the client configuration type.                                                                                                                   |
| `src/lib/db`                                             | The Drizzle schema and the Postgres connection pool.                                                                                                                              |
| `src/lib/kafka`                                          | The Kafka producer and consumer factories and the connection options.                                                                                                             |
| `src/lib/event`                                          | The event layer: events, the outbox and Kafka publishers, the consumer hub and the outbox relay.                                                                                  |
| `src/lib/repository`                                     | The repository contract every resource's storage implements, and its Postgres base class and an in-memory one.                                                                    |
| `src/lib/testing`                                        | Test helpers: the `mock()` double for any interface.                                                                                                                              |
| `src/lib/ethereum/transaction-v1`                        | The Ethereum transaction resource, its repository, state machine, state controller, ledger, resolver and event consumer.                                                          |
| `src/lib/midnight/ethereum-erc20-vault`                  | The ERC-20 vault: its action set, circuit and ledger ports, signet readers, respond outcome sources, the flusher, and one folder per resource version.                            |
| `src/lib/midnight/ethereum-erc20-vault/vault-request-v1` | The vault request resource, its repository, state machine, state controller, resolver and event consumer.                                                                         |
| `src/lib/midnight/ethereum-erc20-vault/deposit-v1`       | The deposit resource, its repository, state machine, state controller, resolver, event consumer, service and adaptor.                                                             |
| `src/lib/midnight/transaction-v1`                        | The Midnight transaction resource, its repository, state machine, state controller, ledger, resolver, event consumer, service and adaptor.                                        |
| `src/lib/midnight/wallet`                                | The wallet layer: the `Wallet` interface, the seed wallet and its facade, the stored seed, and the backend's relayer wallet.                                                      |
| `src/lib/midnight`                                       | The Midnight modules every domain shares: the address abbreviation, the browser `Buffer` shim and the in-memory private state provider.                                           |
| `src/server`                                             | The code that runs: the composition root, the server action files and the start-up.                                                                                               |
| `src/instrumentation.ts`                                 | Runs once when the server process starts and calls the start-up in `src/server/start.ts`.                                                                                         |
| `integration-tests`                                      | The integration tests and their helpers, run with `yarn test:integration` (see [Testing](#testing)).                                                                              |
| `scripts`                                                | The boundary guard (`yarn boundaries`) and the diagram library generator (`yarn diagram-library`).                                                                                |
| `drizzle`                                                | SQL migrations and their snapshots, written by `yarn db:generate`.                                                                                                                |
| `zk-assets`                                              | One prover key bundle per contract, built by `yarn zk-assets` and gitignored.                                                                                                     |
| `docs`                                                   | `architecture.md`, the design record the backend was built from, the draw.io diagrams with their style guide `diagramming.md`, and the deposit build plan with its hand-off pack. |
| `public/icons`                                           | The sig.network wordmark and swan, in brown (light theme) and white (dark theme) variants.                                                                                        |

Pages and layouts are server components. A component opts into the browser with `'use client'`
only when it needs state, effects or browser APIs, as `src/components/mode-toggle.tsx` does.

## Configuration

Configuration is read from environment variables on the server at request time. Nothing is baked
in at build time, so one build serves every environment. `.env.example` lists the variables:

| Variable                                         | Secret | Purpose                                                                                                                                                                   |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIDNIGHT_NETWORK_ID`                            | No     | `undeployed` or `stagenet`. Selects the default Midnight endpoints and the published contract values.                                                                     |
| `MIDNIGHT_INDEXER_URL`                           | No     | Optional override of the indexer GraphQL endpoint.                                                                                                                        |
| `MIDNIGHT_INDEXER_WS_URL`                        | No     | Optional override of the indexer subscription endpoint.                                                                                                                   |
| `MIDNIGHT_NODE_URL`                              | No     | Optional override of the node RPC endpoint.                                                                                                                               |
| `MIDNIGHT_PROOF_SERVER_URL`                      | No     | Optional override of the proof server, `http://127.0.0.1:6300` by default.                                                                                                |
| `MIDNIGHT_SIGNET_CONTRACT_ADDRESS`               | No     | 32-byte hex. Overrides the SDK's published signet singleton address, required for `undeployed`.                                                                           |
| `MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY`            | No     | secp256k1 key in SEC1 hex or `secp256k1:base58`. Overrides the published MPC root key, required for `undeployed`.                                                         |
| `MIDNIGHT_ETHEREUM_ERC20_VAULT_CONTRACT_ADDRESS` | No     | 32-byte hex. Overrides the published ERC20 vault address, required for `undeployed`.                                                                                      |
| `EVM_CHAIN_ID`                                   | No     | Ethereum chain ID. `1`, `11155111` and `31337` have a default RPC.                                                                                                        |
| `EVM_RPC_URL`                                    | No     | Optional override of the RPC endpoint, required for other chains.                                                                                                         |
| `DB_CONNECTION_STRING`                           | Yes    | Postgres connection string. The value in `.env.example` points at the [local database](#local-services).                                                                  |
| `KAFKA_BROKERS`                                  | No     | Kafka bootstrap brokers as comma-separated `host:port`. Server-only: it is not part of the client configuration.                                                          |
| `MIDNIGHT_ZK_ASSETS_ROOT`                        | No     | The root the backend's proof provider searches for every contract's prover keys and ZKIR, `zk-assets/` by default (see [Proving keys](#proving-keys)). Server-only.       |
| `MIDNIGHT_RELAYER_SEED`                          | Yes    | 32-byte hex seed of the backend's own Midnight wallet, which finalises and pays for relayer transactions (see [The relayer wallet](#the-relayer-wallet)). Server-only.    |
| `RESPOND_OUTPUT_SOURCE`                          | No     | Where the backend obtains the bytes an MPC attestation is verified over: `evm-node` (default, traces the mined transaction on `EVM_RPC_URL`) or `mpc-cache`. Server-only. |
| `MPC_OUTPUT_CACHE_URL`                           | No     | The MPC output cache, required by the `mpc-cache` source. Server-only.                                                                                                    |
| `MIDNIGHT_USER_SEED`                             | Yes    | Tests only: the funded Midnight wallet the integration tests play the user with. The application never reads it.                                                          |

Each section of the client configuration is owned by one module under `src/lib/config`
(`midnight-network-config.ts`, `midnight-signet-config.ts`, `midnight-ethereum-erc20-vault-config.ts`,
`ethereum-config.ts`): it declares the schema of its variables, holds its defaults and builds its
section. The Midnight network set is the SDK's `MidnightNetwork` enum narrowed to the two networks
the application supports, and contract addresses and public keys are validated and normalised with
the SDK's own parsers.

Next.js reads `.env.local` from the project root, never from `src`. In deployed environments the
same variables are set on the process.

### Server and client halves

`src/lib/config/server-config.ts` validates `process.env` with one zod schema composed from the
section modules and produces a `ServerConfig` with two halves: `serverOnly` and `client`. A validation failure names the offending
variable. The load is shared by every request through one promise, and a rejected load is dropped
so the next request retries.

- Server code (layouts, pages, route handlers, server actions) calls `getServerConfig()` and may
  read both halves.
- `getClientConfig()` returns the `client` half only. `ClientConfig` (`src/lib/config/client-config.ts`)
  is the one place that defines what the browser may see, and a server-only value can only reach the
  browser by being added to that type.
- The module imports `server-only`, so importing it from a client component fails the build.

### Injection into the browser

`src/app/(configured)/layout.tsx` waits for the request with `connection()`, starts
`getClientConfig()` without awaiting it, and passes the promise to `ConfigProvider`, a client
component that unwraps it with React's `use()`. The provider and the `useConfig()` hook
live together in `src/components/contexts/ConfigContext.tsx`. Client components under the group
read the configuration with the hook:

```tsx
'use client'

import { useConfig } from '@/components/contexts/ConfigContext'

export function NodeLink() {
  const { midnightNetwork } = useConfig()
  return <a href={midnightNetwork.nodeURL}>{midnightNetwork.nodeURL}</a>
}
```

While the promise is pending, the layout's `Suspense` boundary shows `SplashScreen`
(`src/components/splash-screen.tsx`) under the app bar. The HTML shell with the splash
is streamed first and the configured content follows when the load settles.

### Error boundaries

- `src/app/error.tsx` wraps the nested layouts and pages, so a configuration load that fails ends
  up here with the validation message and a "Try again" button. `retry()` re-renders the
  `(configured)` layout, which loads the configuration again. It renders inside the root layout,
  so the app bar and theme stay in place, and it deliberately runs outside
  `ConfigProvider`.
- `src/app/global-error.tsx` replaces the root layout when the root layout itself throws. It owns
  its own `<html>` and `<body>` and imports the global stylesheet, and it follows the operating
  system colour scheme since the theme class on `<html>` is not applied there.

Both render `src/components/error-notice.tsx`, which shows the message and the error digest when
Next.js provides one.

## Local services

`compose.yaml` runs the two services the backend depends on, the same engines the deployed
application uses:

- Postgres 18 on `127.0.0.1:5432`, with the user, password and database all named `demo`.
- Kafka 4.2 on `127.0.0.1:9092`, a single node in KRaft mode without authentication. Topics are
  created on first use.

`DB_CONNECTION_STRING` and `KAFKA_BROKERS` in `.env.example` point at them. Their data lives in
the `full-stack-demo_postgres-data` and `full-stack-demo_kafka-data` Docker volumes and survives
a restart of the containers.

Start them and wait until both accept connections:

```bash
docker compose up -d --wait
```

Stop them and keep the data:

```bash
docker compose down
```

Stop them and delete the data, so the next start begins with an empty database and broker:

```bash
docker compose down --volumes
```

## Database

The backend reaches Postgres through [Drizzle ORM](https://orm.drizzle.team) on the `pg` driver.

- `src/lib/db/schema.ts` declares every table. It is the source the migrations are generated from.
- `src/lib/db/database.ts` exports `createDatabasePool()` and `createDatabase()`. The composition
  root builds one pool for the server process from `DB_CONNECTION_STRING`.
- `drizzle.config.ts` configures drizzle-kit. It reads `DB_CONNECTION_STRING` from the environment,
  or from `.env.local` when that file exists.

### Transactions

`src/lib/db/unit-of-work.ts` carries the current transaction on the async call chain with
`AsyncLocalStorage`, so no method signature mentions it. A write boundary (an adaptor method that
creates, updates or starts something, a resolver's one transition, an outbox batch) wraps its call
in `UnitOfWork.runInTransaction()`, and every repository method beneath it resolves
`currentTransaction() ?? database`, joining the open transaction or falling through to the pool. A
read boundary (`get`, `list`) never opens one: it reads committed state, holds nothing, and the
write that acts on it re-checks inside its own transaction. Work that leaves the async chain (an
un-awaited promise, a timer callback) runs outside the transaction, so a boundary awaits everything
it starts.

### Repositories

Every resource's storage is the one `Repository<Resource>` interface in
`src/lib/repository/repository.ts`: `create`, `get`, `update` and `search`, keyed by resource
name. `search` takes criteria that must all hold (`exact-text` and `bool` on a named field), an
optional order, limit and a `lock` for the open transaction: `update` for the row a transition is
about to write, which waits for a row another transaction holds, and `update-skip-locked` for the
rows a relay batch claims, which leaves such a row out. A resource's repository file is a type
alias of that interface, and its SQL
implementation extends `SQLRepository` in `src/lib/repository/repository-sql-impl.ts` with the
table, the resource schema and two row mappers, so repositories differ only in the table they
name. The table's column properties carry the resource's field names, which is how a criterion
finds its column. Every row read is parsed with the resource schema, since a stored row is as
untrusted as wire input: it may have been written by an older version of the code.

To change the schema, edit `src/lib/db/schema.ts`, then write the migration and commit the files
it adds under `drizzle`:

```bash
yarn db:generate --name describe_the_change
```

Apply the migrations the database has not yet run:

```bash
yarn db:migrate
```

## Kafka

The backend reaches Kafka through [`@platformatic/kafka`](https://github.com/platformatic/kafka),
which documents support for Apache Kafka 3.5.0 to 4.2.0. `src/lib/kafka/clients.ts` owns the
connection options and the `createProducer()` and `createConsumer()` factories, and the composition
root builds the one producer of the server process, and a consumer is owned and closed by the
loop that asked for it. Keys, values and headers are strings.

Consumers run inside the Next.js server process. `src/instrumentation.ts` calls
`startBackend()` in `src/server/start.ts` from `register()`, which Next.js calls once when the
process starts, and that awaits the backend's `start()` (see [Composition](#composition)). Every
replica of the application joins the same consumer group, and Kafka divides the topic's
partitions among them.

## Testing

Three kinds of test cover the backend, each with its own command: unit tests that open no socket,
integration tests that reach the local services one file at a time, and one end-to-end test that
drives a whole deposit through the local stack. The unit tests run on every `yarn check`, the
integration tests whenever a change touches a repository, a migration, a state machine, a state
controller, a resolver, a ledger implementation, the flusher, the sweep, the composition root or
the start-up, and the end-to-end deposit is part of the integration run.

### Unit tests

Unit tests run with [vitest](https://vitest.dev): `yarn test` runs every `src/**/*.test.ts`
once, in about two seconds, and `yarn check` includes it. Only unit tests sit beside the code
they cover, and they are table driven: an array of cases, each naming the doubles its
collaborators are built from, the arguments and a check, run through `test.each`. They cover the
layers that hold logic: the state machines over every `(state, action)` pair, the state
controllers, the resolvers, the services, the adaptors, the consumers, the flusher, the sweep and
the ledger implementations' classification of what the node answered.
`mock<Interface>(name, methods)` in `src/lib/testing/mock.ts` builds a double that answers with
the methods a case supplies and throws on any other call, so a dependency the case did not script
cannot be used unnoticed. `MemoryRepository` in `src/lib/repository/repository-memory-impl.ts` is
a working in-memory repository for flow tests. `vitest.config.ts` resolves the `@/` alias and
resolves `server-only` to its empty module under the `react-server` condition, as Next.js's
server graph does, so server modules load in the runner.

```bash
yarn test
```

### Integration tests

Integration tests live under `integration-tests/` and run with `yarn test:integration` against
the [local services](#local-services) and the Midnight stack named in `.env.local`:
`vitest.integration.config.ts` runs the files one at a time, since they share one Postgres and
one Kafka, `setup.ts` loads `.env.local`, `backend.ts` builds the test's backend through the same
`getBackend()` the server uses, and `user-wallet.ts` builds the user's wallet from
`MIDNIGHT_USER_SEED`. A test file creates rows under a caller name of its own and deletes them,
its outbox entries included, in `afterAll`, then stops the backend and ends the pool. Stop any
dev server before a run: it joins the same Kafka consumer group, so its consumers and outbox
relay would compete with the test's.

| File                                         | Needs                                             | Covers                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `repository-sql.test.ts`                     | Postgres                                          | `SQLRepository`: the round trip, a malformed row refused on read, a skip-locked search.                                         |
| `backend-lifecycle.test.ts`                  | Postgres, Kafka, the Midnight stack               | `start()` runs once, syncs the relayer wallet and sweeps, and `stop()` ends every loop.                                         |
| `midnight-transaction-ledger.test.ts`        | the indexer, the proof server                     | `MidnightTransactionLedgerImpl`: an unknown id is pending, an empty transaction proves.                                         |
| `midnight-transaction-resolve.test.ts`       | Postgres, the proof server                        | A committed Midnight transaction is proven and the row and the outbox show it.                                                  |
| `ethereum-transaction-broadcast.test.ts`     | Postgres, the anvil fork                          | A signed transaction is broadcast and included, and a second one at a consumed nonce ends `NonceConsumed`.                      |
| `ethereum-erc20-vault-request.test.ts`       | Postgres, the indexer                             | Vault request storage, the one-live-request index, a starter's conflict mapping, the readers and the resolver's reads.          |
| `ethereum-erc20-vault-flush.test.ts`         | the Midnight stack (the relayer wallet syncs)     | The first flush starts the relayer wallet and submits nothing when nothing is queued.                                           |
| `ethereum-erc20-vault-deposit-start.test.ts` | Postgres, the indexer, the proof server, the fork | `startDeposit` stores the deposit and its start call, the call proves, listing and the early complete refusal, a refused token. |
| `ethereum-erc20-vault-deposit.test.ts`       | the whole stack                                   | The end-to-end deposit below.                                                                                                   |

The whole suite takes four and a half to five minutes, of which the end-to-end deposit is four
to four and a half:

```bash
yarn test:integration
```

One file runs alone with vitest's own command line, and the verbose reporter is the only way to
see what a test logs:

```bash
yarn vitest run --config vitest.integration.config.ts --reporter=verbose integration-tests/ethereum-erc20-vault-deposit.test.ts
```

### The end-to-end deposit

`integration-tests/ethereum-erc20-vault-deposit.test.ts` takes one deposit of one USDC from
`startDeposit` to `Completed` against the whole local stack: Postgres, Kafka, the Midnight
node, indexer and proof server, the fakenet MPC responder and the anvil Sepolia fork, with the
relayer and user wallets of `.env.local` funded. The test starts the backend, plays the user's
wallet (balancing and submitting the two caller calls), and funds the deposit account on the
fork with anvil's cheatcodes, while the backend flushes, sends, polls the MPC, broadcasts the
sweep, and queues and flushes the attestation on its own, as [Deposit lifecycle](#deposit-lifecycle)
describes. It then asserts the outcome `minted`, the request `Attested` with an `executed`
attestation, the slot gone from the vault ledger, the sweep `Succeeded`, and the 23 lifecycle
events of the deposit, its two caller calls and its vault request in publication order. A run
takes four to four and a half minutes (whether the MPC's attestation is posted before or after
the sweep that looks for it decides which), of which roughly 90 seconds is waiting for the 30
second sweep on the three legs only a sweep advances, and the ledger is left with no open
request, so runs repeat without cleaning the chain.

## Caller authentication

The vault identifies a user by a 32-byte secret, the value of the contract's `callerSecretKey`
witness. The application calls it the caller secret. The caller id it names is a SHA-256 of the secret under an
application domain tag, in hex, computed on the server. It is kept independent of the
contract's own `userCommitment` of the same secret on purpose: the contract may change its hashing
at a fork, and the application's resource names must survive that.

- A user logs in through the Settings popover by pasting a caller secret or generating a fresh
  one. `CallerProvider` (`src/components/contexts/CallerContext.tsx`) holds the secret in page
  memory only, so a reload logs out, and `useCaller()` exposes it with the caller name and the
  login state.
- Every server action takes the caller secret as its first argument. `resolveCaller()`
  (`src/lib/caller/resolve-caller.ts`) validates it and derives the caller id and its
  `callers/{caller}` name, and the action compares every resource name it receives against that
  name, so a caller only ever creates or reads under their own caller. The
  shared schemas and name helpers live in `src/lib/caller/caller.ts`.

## Events

`src/lib/event` lets the backend announce a fact (a transaction was created, a deposit changed
state) after the database write that made it true, and lets workers in the same process react
to it. An event is `{ id, type, key, data }`: `type` names what happened, `key` orders events
about one resource, and `data` names the resource and never carries a secret. A consumer loads
the resource and acts on its current state, so a redelivered event is harmless. An event's data
shape is a contract with the events already on the topic, which keep the shape they were
published with: a field is added as optional, and a changed shape is published under a new type.

- `event.ts` holds the event schema, `newEvent()` and the `full-stack-demo.events` topic.
- `event-publisher.ts` is the publishing interface with two implementations. The domain uses
  `event-publisher-outbox-impl.ts`, which writes an outbox entry on the transaction open on the
  call chain, so the event becomes visible exactly when the surrounding transaction commits. The relay
  uses `event-publisher-kafka-impl.ts`, which sends to Kafka and resolves on the broker's
  acknowledgement.
- `outbox-entry-v1` holds the `OutboxEntry` resource (`outbox-entries/{id}`), its repository over
  the `event_outbox_entries_v1` table, and the processor. `OutboxEntryProcessor.process()`
  relays unsent entries oldest first in locked batches (a `search` with
  `lock: 'update-skip-locked'`, so several replicas never relay the same entry) and marks them
  sent. A trigger on the table calls
  `pg_notify` when an entry's transaction commits, the processor holds one dedicated connection
  that listens for it, and a sweep every 30 seconds catches anything a lost notification missed.
  Delivery is at least once.
- `event-consumer.ts` is the consumer interface (`wantsEvent`, `handleEvent`), and
  `event-consumer-hub.ts` the hub that owns the process's consumers. `runEventConsumerHub()`
  reads the topic as the `full-stack-demo.events` group until its `AbortSignal` aborts, hands
  each event to every consumer that wants it in registration order, and commits the offset only
  after they all return. A handler that throws leaves the offset uncommitted, so the event is
  redelivered after a restart delay. `runOutboxEntryProcessor()` is the relay's loop under the
  same signal.

Domain events are lifecycle events, one per state a resource enters, defined with
`defineEvent(type, dataSchema)` beside the state controller that publishes them (for example
`MIDNIGHT_TRANSACTION_EVENT_BY_STATE` in `src/lib/midnight/transaction-v1/transaction-state-controller.ts`).
A definition creates typed events for the publisher and parses event data for the consumer, so
the consumer is an adaptor for the bus: it matches the definitions it wants, parses the data and
calls a resolver. Handlers run outside any database transaction, since the resolver behind them
decides where its writes go.

The backend's `start()` registers the consumers and runs the hub and the processor with the
server process. Next.js evaluates instrumentation and request code (server actions, route
handlers) in separate module graphs, so each graph has its own backend: only the instrumentation
graph's backend starts, and request code only publishes. The Kafka client is listed in
`serverExternalPackages` in `next.config.ts`, since it resolves its own files through
`import.meta.url` and only works unbundled.

## Deposit lifecycle

A deposit moves an ERC-20 amount from the depositor's deposit account on the EVM chain into the
vault and mints it as a shielded vault token on Midnight. Four resources and one process carry it,
every resource named under the depositor's caller (see [Caller authentication](#caller-authentication)):

| Piece                | Name                                                       | Section                                               |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Deposit              | `callers/{caller}/ethereum-erc20-vault-deposits/{deposit}` | [ERC-20 vault deposit API](#erc-20-vault-deposit-api) |
| Vault request        | `callers/{caller}/ethereum-erc20-vault-requests/{request}` | [Vault requests](#vault-requests)                     |
| Midnight transaction | `callers/{caller}/midnight-transactions/{transaction}`     | [Midnight transactions](#midnight-transactions)       |
| Ethereum transaction | `callers/{caller}/ethereum-transactions/{transaction}`     | [Ethereum transactions](#ethereum-transactions)       |
| The flush            | a process with no row                                      | [Flushing the vault queue](#flushing-the-vault-queue) |

Each resource has a lifecycle whose states name what the resource waits for, a state controller
that is the only writer of its state and publishes one event per state entered, a resolver that
does what the current state needs, and an event consumer that nudges the resolver. A child names
the resource it serves in its `parent` field, and its events carry `{ name, parent }`, so the
parent's consumer matches a child's terminal event on the parent's collection without a read.
The story below is the order one deposit visits them, with the actor of each step. The sections
in the table hold the definitions.

1. **Start (the user).** The browser holds the caller secret, the 32-byte witness of the vault's
   two user circuits, and a connected Midnight wallet. It calls `startDeposit(callerSecret,
{ depositRequest, wallet })`, where `wallet` is the wallet's coin and encryption public keys.
   The service derives the deposit account from the caller's commitment, draws a random slot
   `inIndex`, assigns the EVM nonce the sweep will use, builds the `startDeposit` circuit call
   (the contract's asserts fire here, before anything is written), then in one database
   transaction stores the deposit in `AwaitingStartTransaction` and commits the call as a
   Midnight transaction with signer `caller` under it.
2. **The caller's call (the user's wallet, then the backend).** The Midnight transaction resolver
   proves the call through the proof server (`AwaitingWallet`). The browser finds it with
   `listTransactions(callerSecret, { parent })`, the wallet balances and signs its `unboundTx`,
   and `submitTransaction` hands the finalized bytes back (`AwaitingSubmission`). The resolver
   submits them to the node (`AwaitingInclusion`) and watches the indexer until the ledger
   records them (`Succeeded`). Meanwhile the user funds the deposit account on the EVM chain with
   the amount and the gas for the sweep (the end-to-end test does this with anvil's cheatcodes).
3. **Started (the backend).** The transaction's `succeeded` event nudges the deposit resolver,
   which records the deposit started (`AwaitingVaultRequest`) and in the same transaction queues
   a vault request in `AwaitingFlush` under it. From here until the request is attested the
   backend acts alone, paying every Midnight transaction with the relayer wallet's DUST.
4. **The vault request (the relayer wallet, the MPC and the EVM chain).** The request's states are
   the vault's own pipeline. The flusher moves the queued entry into the output buffer
   (`AwaitingFlush` to `AwaitingSend`, a vault-level batch over the relayer wallet). The resolver
   commits the relayer's `sendDeposit` call (`AwaitingSignature`), which records the request on
   the ledger and notifies the signet singleton. The MPC signs the sweep, an EVM transaction from
   the deposit account at the assigned nonce, and the resolver reads that post on a sweep
   (`AwaitingBroadcast`). The resolver commits the signed bytes as an Ethereum transaction, whose
   resolver broadcasts them and watches the chain, and once that child has ended either way the
   step is done (`AwaitingAttestation`). The MPC watches the mined transaction and posts an
   attestation of its result, which the resolver reads on a sweep and verifies over the bytes
   `RESPOND_OUTPUT_SOURCE` recovers (`AwaitingAttestationQueue`). The resolver commits the
   relayer's `queueAttestation` call (`AwaitingAttestationFlush`), the flusher flushes the
   attestation, and the request is `Attested`.
5. **The ledger is the acknowledgement.** Every step of the request is recorded only when the
   vault ledger, read through `requestStage()`, or the singleton's posts show it done. A step is
   never inferred from a child transaction's outcome: a child that failed is replaced while the
   ledger shows its step undone, and a child that succeeded still waits for the ledger. The
   deposit's two caller calls get the same treatment, since a node can apply bytes whose
   acknowledgement never came back: the deposit resolver reads the ledger before it believes a
   failed start or complete.
6. **Complete (the user).** The request's `attested` event nudges the deposit to
   `AwaitingCompletion`, the one state after the start that waits for the user. The browser calls
   `completeDeposit(callerSecret, { name, wallet })`: the service builds the `completeDeposit`
   call from the attested request (its id, its attestation output and a fresh random mint nonce),
   stores `AwaitingCompleteTransaction` and commits the call as a second caller transaction,
   which repeats step 2. Its `succeeded` event completes the deposit with `outcome` `minted` (the
   attested sweep executed and returned true) or `closed`. A failed complete returns the deposit
   to `AwaitingCompletion`, where the user may complete again, unless the ledger shows the
   request settled, in which case the deposit is completed from the stored attestation.
7. **Events nudge, the sweep guarantees.** A lifecycle event only nudges a resolver, which
   dispatches on the row's state and never on the event, so a redelivered or lost event changes
   nothing. The sweep runs every 30 seconds, calls `resolvePending()` on the Midnight
   transaction, Ethereum transaction, vault request and deposit resolvers, and fires the flusher
   (see [Start-up and the sweep](#start-up-and-the-sweep)). It is load-bearing, not a safety
   net: the MPC's signature and attestation posts never reach Kafka, and neither does the EVM
   chain's inclusion of the sweep, so those three legs advance only on a sweep, and a round trip
   of four to four and a half minutes spends roughly 90 seconds waiting for one.

One failure the vault can report is kept unreachable rather than modelled. A request whose sweep
reuses an EVM nonce that an earlier sweep from the same deposit account consumed is attested
`unviable` at a block at or below the entry's `lastSeen`, and the queue circuit refuses that
attestation for ever (`Stale attestation`). The MPC alone signs from a deposit account, so that
earlier sweep can only be a previous request of the same caller, and the backend assigns the
nonce at start: the higher of the account's pending transaction count on the chain and one above
the highest nonce held by the caller's live deposits. No two requests of one deposit account
share a nonce, so neither the deposit nor the vault request has a state for the case, and the
vault request resolver logs it as an invariant violation if it ever sees it.

## Midnight transactions

`src/lib/midnight/transaction-v1` carries one circuit call from built to on chain. The states
name what the row waits for (`AwaitingProof`, `AwaitingWallet`, `AwaitingSubmission`,
`AwaitingInclusion`, then `Succeeded` or `Failed` with a `failure` reason), the legal transitions and the
fields each state holds are the table in `transaction-state-machine.ts`, and
`MidnightTransactionStateController` is the only writer, one method per action, each publishing the
lifecycle event of the state entered. `MidnightTransactionStateResolver` does what the current state
needs through the `MidnightTransactionLedger` port and applies one transition, and
`MidnightTransactionEventConsumer` nudges it on every lifecycle event. Every lifecycle event carries
the transaction's `name` and its `parent`, so the consumer of the parent resource matches on
the parent's collection without a read.

A transaction names its `signer`: `caller` when the depositor's browser wallet balances and
signs it, `relayer` when the backend's own wallet does, which is the case for every
permissionless vault circuit (flushes, sends, attestation queues). `AwaitingWallet` is that
wallet's to-do: a caller transaction waits for the browser to call `submitTransaction`, a
relayer transaction is finalised by the resolver through the `RelayerWallet` port.

The browser's side of a transaction is `TransactionService` (`transaction-service.ts`):
`listTransactions(caller, { parent })` finds the live transaction under a resource the caller
owns, the browser wallet balances and signs its `unboundTx`, and
`submitTransaction(caller, { name, finalizedTx })` hands the finalized bytes back, which moves
the row from `AwaitingWallet` to `AwaitingSubmission`. The server actions in
`src/server/actions/transaction-actions.ts` forward to `TransactionServiceAdaptor`.

`MidnightTransactionLedgerImpl` is the ledger behind the local or stagenet services: `prove`
deserialises the unproven bytes and proves them through the proof server with the prover keys
under `MIDNIGHT_ZK_ASSETS_ROOT`, `submit` sends the wallet's finalized bytes to the node
over one WebSocket connection and returns one of the transaction's ledger identifiers, and
`status` asks the indexer for that identifier and maps `SUCCESS`, `PARTIAL_SUCCESS` and
`FAILURE` to the ledger outcome. A transaction the indexer has not recorded stays pending until
its TTL expires it, which the resolver's `resolvePending()` applies on the sweep: it resolves every
non-terminal transaction, oldest first, so a lost event or a passed `expireTime` is caught within
one sweep interval.

`submit` settles by what the node's answer established, not by whether an answer arrived.
`Rejected` means the node refused the bytes with a reason (its JSON-RPC error, such as
`1010: Invalid Transaction`, or a status of invalid, dropped or usurped) or the bytes never left
the process (no connection). The node answering `1013: Transaction Already Imported` is an
acknowledgement, not a refusal: the event consumer and the sweep routinely submit the same
bytes at once, and the later one is told the pool already holds them. An acknowledgement lost
after the send, which the SDK reports as `Transaction submission failed` over a closed socket,
is not a rejection either: the node may hold and apply the bytes. In both cases `submit`
returns the id, the inclusion watch reads the indexer, and a transaction the node did drop ends
`Expired` at its TTL. A recorded `error` carries the whole cause chain, so a `Rejected` row says
what the node said. The submit-time refusal and the ledger's verdict are two actions of the state
machine: `recordRejection` applies only from `AwaitingSubmission` and `recordLedgerFailure` only
from `AwaitingInclusion`, so a stale duplicate submission whose refusal was not the
already-imported answer cannot write `Failed` over a transaction the node holds. The table refuses
the transition and the resolver swallows the conflict. The deposit resolver adds a second guard
for the caller's two circuit calls, whose acknowledgement the vault ledger is: it reads the
ledger before it believes a failed start or complete (see
[ERC-20 vault deposit API](#erc-20-vault-deposit-api)).

### The relayer wallet

`RelayerWallet` (`src/lib/midnight/wallet/relayer-wallet.ts`) is the backend's own wallet, and
`RelayerWalletSeedImpl` runs it over the same seed wallet facade the browser's seed wallet uses
(`seed-wallet-facade.ts`): the keys derive from `MIDNIGHT_RELAYER_SEED` at construction, and
`finalize` balances, signs and finalises an unbound transaction with it. One instance syncs per
process: the backend's `start()` starts it the moment the server starts, since a sync can take
minutes on a long chain (the local stack's short chain syncs in a second or two, which the
`Relayer wallet synced in N ms` log line reports), a `finalize` that arrives mid-sync waits on
that start, and an instance that was never started refuses to finalise. Next.js evaluates the
request graph separately, and its backend never starts the wallet, so the one started from
instrumentation is the one the process uses.
`provider()` hands the synced wallet to the SDK as the wallet and midnight provider slots of a
midnight-js provider set, so the SDK balances and submits a call itself, and it starts the wallet
when nothing has. The wallet's public keys go into every permissionless circuit call it will later
balance. The wallet must hold NIGHT registered for DUST on the configured network. On the local
stack it is one of the wallets the stack's test harness funded.

### Vault circuits and ledger

`src/lib/midnight/ethereum-erc20-vault/vault-circuits.ts` is the port that builds the vault's
circuit calls as unproven transactions in hex, one method per circuit a deposit needs
(`startDeposit`, `completeDeposit`, `sendDeposit`, `queueAttestation`). Its implementation
binds the vault's generated contract to the prover keys under
`zk-assets/ethereum-erc20-vault/` with compact-js and builds each call with midnight-js's
`createUnprovenCallTx`, under a private state provider that lives for that one call
(`src/lib/midnight/private-state-provider-memory-impl.ts`): the caller's secret is the witness
of the two user circuits, and the permissionless ones prove under a random secret with the
relayer's wallet keys. The call builder reads the wallet's public keys for every circuit, so
both user circuits take them as arguments.

`vault-ledger.ts` is the read port over the vault contract's public state through the indexer,
and `requestStage()` beside it is the pure function that places a request on the vault's
pipeline (`queued`, `flushed`, `sent`, `attestationQueued`, `attestationFlushed`, `settled`)
from the six ledger maps it reads. Every chain step the backend takes is read back from there,
never inferred from its own transaction's outcome.

### Proving keys

Proving happens on the backend, through the proof server that runs beside it. The SDK's
`ProvingProvider` has one implementation, an HTTP client for that server, and the server holds no
contract keys: on every `/check` and `/prove` call the client reads the circuit's prover key and
ZKIR from a local bundle and sends them with the request. The ledger is per chain and the keys
are per contract, so the backend builds a `ZKConfigRegistry` over `MIDNIGHT_ZK_ASSETS_ROOT`: every
subdirectory holding `keys/` and `zkir/` is a bundle, and a call is bound to its bundle by the
verifier key it names, so one ledger proves for every vault and for cross-contract calls. The
contract packages ship only verifier keys, so the prover keys are built once with the pinned
compact compiler:

```bash
yarn zk-assets
```

It lays out the Ethereum ERC-20 vault's bundle under `zk-assets/ethereum-erc20-vault/` and the
signet contract's under `zk-assets/signet/` (both gitignored), verifies them against the
manifests the packages ship, and skips a bundle that already verifies, so a rerun over built
bundles finishes in seconds. A further vault adds its own bundle beside them. It needs the compact
launcher with the compiler version the package pins. A proof through the proof server with these
keys takes five to ten seconds for each vault circuit on the local stack, as the timestamps of the
end-to-end test show.

## Ethereum transactions

`src/lib/ethereum/transaction-v1` carries one signed EVM transaction from committed to on chain,
with the same lifecycle pattern as the Midnight one. The bytes arrive signed (by the MPC, for a
vault request), so a row holds them and what the chain returned for them. The states are
`AwaitingSubmission`, `AwaitingInclusion`, then `Succeeded` with the block that included the
transaction, or `Failed` with a `failure` reason: `Rejected` (the node refused the bytes),
`Reverted` (mined with its gas paid and its call not applied, with its block), `NonceConsumed`
(another transaction from the same sender took the nonce, so this one can never mine) or
`Expired` (the backend stopped waiting at the row's optional `expireTime`, and the chain may still
include the transaction). The transitions and the fields each state holds are the table in
`transaction-state-machine.ts`, `EthereumTransactionStateController` is the only writer, one
method per action, publishing the `ethereum.transaction-v1.<state>` event of the state entered
with the transaction's `name` and `parent`, `EthereumTransactionStateResolver` does what the
current state needs through the `EthereumTransactionLedger` port (its `resolvePending()` sweeps
every non-terminal transaction, oldest first, where an `expireTime` that passed unnoticed is
applied), and `EthereumTransactionEventConsumer` nudges it on every lifecycle event.

`EthereumTransactionLedgerEthersImpl` is the ledger over an ethers `JsonRpcProvider` on
`EVM_RPC_URL`. `broadcast` sends the signed bytes and resolves with their hash. A node that
already holds or has mined the same bytes (ethers' `NONCE_EXPIRED`, or a message in the
"already known", "already imported", "nonce too low" family) is not an error, since the same
signed bytes can only ever mine once, and any other refusal is recorded as `Rejected` with the
node's message. `status` reads the sender's transaction count first and the receipt only once
the chain holds a transaction at that nonce: a receipt means `mined` or `reverted` by its
status, no receipt means `nonceConsumed`, and a count at or below the nonce means `pending`.
The resolver reads the sender and nonce from the signed bytes, so the row stores neither. The
backend builds the provider with ethers' request cache off (`cacheTimeout: -1`), since a cached
null receipt would make a mined transaction look like a consumed nonce. As on Midnight, the
node's refusal and the chain's verdict are two actions: `recordRejection` applies only from
`AwaitingSubmission` and `recordFailure` only from `AwaitingInclusion`, so a stale duplicate
broadcast cannot write `Failed` over a transaction the node holds.

## Vault requests

`src/lib/midnight/ethereum-erc20-vault/vault-request-v1` carries one request on the ERC20 vault
through its permissionless processing, from queued at the action's start circuit to attested and
flushed, ready for the caller's complete circuit. The row's `parent` is the deposit, its `action`
is one of `VAULT_ACTIONS` (`vault-action.ts`, `deposit` today) and `inIndex` is the slot the start
circuit queued it under. The states name what the request waits for: `AwaitingFlush`,
`AwaitingSend`, `AwaitingSignature`, `AwaitingBroadcast`, `AwaitingAttestation`,
`AwaitingAttestationQueue`, `AwaitingAttestationFlush`, then `Attested`. There is no failure
state: the contract deduplicates every step, so a child transaction that fails is replaced until
the ledger shows the step done. The transitions and the fields each state holds are the table in
`vault-request-state-machine.ts`, `VaultRequestStateController` is the only writer, with one
`record` method per step and three `start` methods that commit a child under the row (the relayer's
send call, the signed EVM transaction, the relayer's queue call), publishing the
`midnight.ethereum-erc20-vault.vault-request-v1.<state>` event of the state entered with the
request's `name` and `parent`.

The ledger is the acknowledgement for every step. `VaultRequestStateResolver` reads the vault
ledger through `requestStage()` and the singleton's posts through the readers, records a step the
ledger shows done, and otherwise commits the one child that does the step when no live child does:
it never infers a step from a child's outcome. A send child that failed is replaced while the
ledger shows no send. A broadcast child that the node refused is replaced, while one that mined,
reverted or lost its nonce ends the step, since the MPC attests each of those. A request the
ledger shows settled before it is attested is logged and left alone, because only the complete
circuit removes a request's arguments. `resolveWaitingFlushes()` re-reads every request waiting
for a flush, and `resolvePending()` sweeps every non-terminal request, reading the ledger once
per sweep. `VaultRequestEventConsumer` nudges the resolver on the request's own lifecycle events
and on the terminal events of its child transactions, whose `parent` names the request.

Two readers serve the resolver. `signet-readers.ts` builds one SDK `SignetRequestResponseReader`
per action over that action's request map, through which the resolver polls the MPC's signature
(`getSignedEvmTransaction`, judged against the row's `depositAccount`) and the attestation posts.
Every read walks the singleton's whole event history from the indexer, since a row carries no
block to bound the walk by. `respond-outcome-source.ts` is the port that obtains the bytes an
attestation is verified over, which travel off chain: `RESPOND_OUTPUT_SOURCE` selects
`RespondOutcomeSourceEvmNodeImpl`, which traces the mined transaction on `EVM_RPC_URL` with
`debug_traceTransaction` and recomputes the bytes as the MPC does, or
`RespondOutcomeSourceMpcCacheImpl`, which downloads the object the MPC cached under
`MPC_OUTPUT_CACHE_URL`. Either checks each post over its candidate with the vault's pinned
response key and keeps the first that verifies. The row stores the verified attestation as five
columns (`attestationBlockHeight`, `attestationOutputKind`, `attestationDigest`,
`attestationSignature` as `bigR.x || bigR.y || s || recoveryId` in hex, `attestationOutput`),
and `vault-request-attestation.ts` rebuilds the event the queue circuit takes from them.

### Flushing the vault queue

`flushQueue` is the one vault circuit that touches shared state, so flushing is a vault-level batch
and never a step of one request. `Flusher` (`src/lib/midnight/ethereum-erc20-vault/flusher.ts`) has
one method, `flush()`, and `FlusherImpl` keeps one flush in flight per process: a call during a run
marks the run to go again and shares its promise, so a burst of nudges costs one further ledger
read. Each run is the SDK's `flushPending` over the relayer's provider set. It reads the vault
ledger, chooses up to ten waiting items (queued attestations first, then queued requests, in ledger
order, leaving out a request whose identical twin is open), builds the call with its ledger work in
the fallible section, proves it, balances and submits it through the relayer wallet and waits for
inclusion. When a flush lands, the flusher calls `resolveWaitingFlushes()` on the vault request
resolver, so every request waiting for a flush re-reads the ledger, and then runs again, since more
may wait behind the width. The composition root assembles the provider set on the first flush
(`createVaultProviders` in `src/server/backend.ts`): the indexer, the vault's zk config provider
and compiled contract that the circuits also use, the proof provider the Midnight transaction
ledger also uses, the relayer wallet's `provider()`, so a flush that arrives before the wallet has
synced waits for it, and an in-memory private state under a random secret, since `flushQueue`
never reads the witness.

Two flushes built against the same ledger conflict and the chain decides. The loser lands as a
`CallTxFailedError` with status `FailFallible` and its fee paid, or fails to build on one of
`flushQueue`'s own asserts (`Request not queued`, `Attestation not queued`, `Identical request
open`, each thrown as a plain error whose message the compact runtime prefixes with
`failed assert: `). Either is a lost race, and the run goes again at once from a fresh ledger read.
Any other failure, `FailEntirely` included, is logged and ends the run until the next nudge.
`FlushEventConsumer` nudges the flusher when a vault request enters `AwaitingFlush` or
`AwaitingAttestationFlush` and returns without waiting for the run, so a flush holds no other
consumer behind it while it proves and lands: 15 to 20 seconds from the nudge to the request's
next state on the local stack, and minutes on a loaded host. A run that fails is logged, and the
sweep flushes again within 30 seconds.

## Composition

Everything under `src/lib` is inert: a class takes its dependencies as constructor arguments and
nothing there builds anything. `createBackend()` in `src/server/backend.ts` builds the whole
dependency graph in dependency order from the server configuration, and `getBackend()` memoises
it once per module graph (`lazySingleton()` in `src/lib/lazy-singleton.ts` drops a failed build
so the next call retries). Server actions live under `src/server/actions`: a `'use server'` file
may export only async functions, so each action is one line that reaches its adaptor through
`getBackend()`.

### Start-up and the sweep

The backend object carries its lifecycle. `start()` begins the relayer wallet's sync, registers
the five consumers (Midnight transactions, Ethereum transactions, vault requests, deposits and the
flush consumer) on the hub, and runs three loops under one `AbortSignal`: the hub's Kafka loop,
the outbox relay and the sweep. It runs once per backend instance (a later call shares the first
promise) and resolves as soon as the loops are running, before the wallet has synced, so nothing
waits on it: adaptors work without a start, and a resolver that reaches the wallet early waits on
the sync. `src/server/start.ts` is the one-liner instrumentation calls. `stop()` aborts the
signal, waits up to 30 seconds for the resolve or flush that was mid-run, and closes the Kafka
consumer, the outbox listener's connection and the Kafka producer. The pool stays open for its
owner to end, so an integration test calls `stop()` and then `pool.end()`, and a stopped backend
never starts again.

The sweep runs every 30 seconds: `resolvePending()` on the Midnight transaction, Ethereum
transaction, vault request and deposit resolvers in that order, then the flusher's `flush()`. It
is what catches a lost event, a passed `expireTime`, and the three legs of a deposit that only a
read can advance: the MPC's signature and attestation posts never reach Kafka, and neither does
the EVM chain's inclusion of the sweep, so a deposit waits for up to one interval on each, about
90 seconds of a round trip. A task's failure is logged under its name and the pass goes on, and an
abort ends the pass after the task that is running. The flush consumer does not wait for the
flush it nudges, since a run proves and lands over tens of seconds and the hub holds every
consumer behind a handler: the flusher coalesces nudges and the sweep flushes again, so a dropped
run costs at most one interval.

## ERC-20 vault deposit API

`src/lib/midnight/ethereum-erc20-vault/deposit-v1` is the resource-oriented API for vault
deposits, designed in `docs/architecture.md` under Deposit API (the design keeps its own state
names, and its opening section maps them to the ones built here). This UI is its only client, so
it is exposed as server actions rather than HTTP routes. A deposit is named
`callers/{caller}/ethereum-erc20-vault-deposits/{deposit}`, where the caller is the depositor's
64-character hex caller id and the deposit id is a UUID the server assigns.

A deposit is a resource with a lifecycle. Each state names what the deposit waits for, so it is a
to-do for exactly one actor:

| State                         | Waits for                                                                            | Actor                                  |
| ----------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| `AwaitingStartTransaction`    | the `startDeposit` call to be proven, finalised by the wallet and included           | the browser wallet, then the resolvers |
| `AwaitingVaultRequest`        | the vault request behind the deposit to be attested                                  | the backend (vault request lifecycle)  |
| `AwaitingCompletion`          | the user to complete the deposit, or the sweep to see it settled on the vault ledger | the user, then the resolvers           |
| `AwaitingCompleteTransaction` | the `completeDeposit` call to be proven, finalised and included                      | the browser wallet, then the resolvers |
| `Completed`                   | nothing: `outcome` is `minted` or `closed`                                           |                                        |
| `Failed`                      | nothing: `failure` is `StartFailed`, `error` carries the child's message             |                                        |

A deposit holds the caller's request (`erc20Address`, `amount`) and the fields the server assigns
at start: `inIndex` (a random 64-bit slot in the vault's request buffer), `depositAccount` (the
EVM account the user funds and the MPC sweeps from, derived from the MPC root key, the vault
address and the contract's commitment of the caller secret), `evmNonce` (the higher of the
account's pending transaction count on the EVM chain and one above the highest nonce held by the
caller's live deposits, so no two sweeps share a nonce), and the gas envelope of the sweep
(`gasLimit` 100 000, `maxFeePerGas` 30 gwei, `maxPriorityFeePerGas` 1 gwei). `outcome` is set on
completion: `minted` when the attested sweep executed and returned true, `closed` otherwise. The
children of a deposit name it as their `parent`: the `startDeposit` and `completeDeposit`
Midnight transactions (signer `caller`) and the vault request, found through their own
repositories and server actions.

- `deposit.ts` holds the resource schema and its type, the state, failure and outcome sets, and
  the resource-name format and builder, shared by the server and the browser. The generic EVM
  address, base-unit amount, hex and UUID schemas live in `src/lib/value-schemas.ts`.
- `deposit-repository.ts` is the storage interface, `Repository<Deposit>`, and
  `deposit-repository-sql-impl.ts` its Postgres implementation over the
  `midnight_ethereum_erc20_vault_deposits_v1` table (see Repositories under Database).
- `deposit-state-machine.ts` is the pure transition table and the consistency check,
  `deposit-state-controller.ts` the only writer of a deposit's state with one lifecycle event per
  state entered (`midnight.ethereum-erc20-vault.deposit-v1.<state>`, data `{ name }`),
  `deposit-state-resolver.ts` what each state needs (nudged by the children's terminal events and
  by the sweep), and `deposit-event-consumer.ts` the adaptor from the event bus to the resolver.
  The resolver believes a child that succeeded, and reads the vault ledger before it believes one
  that failed, since the node can apply a transaction whose acknowledgement never came back: a
  failed start whose request the ledger holds (queued or later) is recorded as started, a failed
  complete whose request the ledger has settled is recorded as completed with the outcome of the
  stored attestation, and a deposit in `AwaitingCompletion` with no live complete attempt is
  checked the same way on every sweep, so a complete that landed under a lost acknowledgement, or
  through another client, is recorded within one sweep interval. One ledger read serves a whole
  sweep, and none is made when no deposit needs one.
- `deposit-service.ts` is the API's method set and `deposit-service-impl.ts` the implementation.
  The two user actions take the browser wallet's public keys (`wallet: { coinPublicKey,
encryptionPublicKey }`, 32 bytes each in hex): the call builder reads them for every circuit,
  and `completeDeposit` mints to the coin public key.
- `deposit-service-adaptor.ts` is `DepositServiceAdaptor`, which only translates: the secret
  becomes a `Caller`, the arguments are validated, the service is called, and its result becomes
  `{ ok: true, deposit }` or `{ ok: false, error }`. A state conflict and a contract assert firing
  while the call is built (the vault refusing the token, for example, as `failed assert: ...`)
  are `{ ok: false }` results. The server actions the UI calls, `startDeposit`,
  `completeDeposit`, `getDeposit` and `listDeposits` in `src/server/actions/deposit-actions.ts`,
  each forward to it. Amounts cross as `bigint`.

The two user actions build the caller's circuit call before any database transaction is open:
building reads the vault's state from the indexer and runs the circuit locally, which takes
hundreds of milliseconds and is where the contract's own asserts fire, and `startDeposit` also
reads the deposit account's nonce from the EVM chain. The service then opens one transaction
around the controller call that stores the deposit's step and commits the circuit call as a
Midnight transaction under it. The adaptor opens no transaction for these two methods, and the
read methods open none.

After `startDeposit` the browser finds the transaction in `AwaitingWallet` through
`listTransactions(callerSecret, { parent: deposit.name })`, has the wallet balance and sign its
`unboundTx`, and hands the result to `submitTransaction`. The backend takes the deposit from there
until `AwaitingCompletion`, where `completeDeposit` repeats the same steps for the complete call.

```tsx
'use client'

import { completeDeposit, startDeposit } from '@/server/actions/deposit-actions'

const started = await startDeposit(callerSecret, {
  depositRequest: { erc20Address, amount: 1000000n },
  wallet: { coinPublicKey, encryptionPublicKey },
})
// ... fund started.deposit.depositAccount, finalise the start transaction, wait for AwaitingCompletion
const completed = await completeDeposit(callerSecret, {
  name: started.deposit.name,
  wallet: { coinPublicKey, encryptionPublicKey },
})
```

## Midnight wallet

`src/lib/midnight/wallet` holds the wallet layer. `MidnightWalletProvider` drives it, and the
wallet components read its types and the connection status label.

- `wallet.ts` defines `WALLET_KINDS` (only `seed` today), `WalletMetadata`, the `Wallet`
  interface with its optional transaction, funding and recovery capabilities, and
  `WalletAddressSnapshot`, the public addresses a wallet publishes before it has synchronised.
- `connection-status.ts` defines `WalletConnectionStatus`, the status label the wallet components
  show, and derives it from the provider's state.
- `seed-wallet.ts` is the seed implementation: it derives account-zero keys from a hex seed,
  publishes the shielded, unshielded and DUST addresses immediately, starts the wallet SDK facade
  against the configured Midnight endpoints, reports synchronisation progress, and clears the
  seed and keys on disconnect. `seed-wallet-facade.ts` holds the key derivation, the facade
  construction and the transaction provider it builds on.
- `MidnightWalletProvider` (`src/components/contexts/MidnightWalletContext.tsx`) owns one wallet
  at a time. It reads the Midnight network from `useConfig()`, so it renders inside
  `ConfigProvider`, which is why `AppBar` sits in the `(configured)` layout. Each connection
  advances a generation: a superseded connection's results are dropped and its wallet is
  disconnected exactly once. The SDK loads on the first connection through a dynamic import.
  The connected seed is written to local storage (`src/lib/midnight/wallet/seed-storage.ts`) and
  restored on the next load, so a refresh reconnects the same wallet. While a seed is stored, no
  other seed can connect: disconnecting clears the store, and so does a failed connection. This
  keeps a wallet secret in a persistent store on purpose, as a convenience for a demo.
- `WalletPanel` (`src/components/wallet-panel.tsx`) renders the wallet for both layouts: the
  connection status, the addresses once known, the seed dialog and disconnect. From the `md`
  breakpoint up, `WalletPopover` shows it from the app bar button that carries the status dot.
  Below it, the `MobileMenu` sheet shows it under a collapsible Wallet item.

One shim exists for the wallet SDK in the browser: `src/lib/midnight/buffer-shim.ts` installs a
global `Buffer` and binds `fetch` before the SDK modules load.

`package.json` pins `@midnightntwrk/ledger-v9` through `resolutions`, so the wallet SDK and the
contract packages share one ledger runtime.

## Home page

The home page shows three sections on dummy data, each owned by one file that reads the data
and passes typed props down, so a real data source replaces the dummy module without touching
the presentation. The balance list and the activity table render every entry at full height and
leave scrolling to `HomeLayout`, described under Styling and theme.

- `BalancesSection` (`src/components/balances-section.tsx`) reads `src/lib/balances/dummy-balances.ts`
  and renders a `BalanceBox` per asset: the amount, its US dollar value, the `TokenIcon`
  (`src/components/token-icon.tsx`, the asset icon with the network badge over its bottom right
  corner) and the Swap and Send buttons. The Deposit, Swap and Send buttons do nothing yet.
- `ActivitySection` (`src/components/activity-section.tsx`) reads `src/lib/activity/dummy-activity.ts`
  and renders `ActivityTable`. Each entry is a collapsible table body: from the `md` breakpoint up
  every column shows, below it a chevron expands the timestamp and block explorer details. The
  entry types live in `src/lib/activity/activity-entry.ts`.
- `SwapPanel` (`src/components/swap-panel.tsx`) holds the local form state for two
  `SwapAmountField`s and the disabled Swap call to action. The token list comes from
  `src/lib/swap/dummy-swap-tokens.ts`.

`AssetAmount` (`src/lib/asset-amount.ts`) is the one shape for an amount of an asset on a network,
shared by the balances and the activity entries. Icons are lucide placeholders until the asset
and network artwork arrives.

## Styling and theme

`src/app/globals.css` is the single source of the theme. It defines the sig.network palette as
Tailwind colours (`brand`, `clamshell`, `dark-neutral` and the status scales), then maps the
semantic tokens (`background`, `primary`, `muted`, `border` and so on) onto that palette for the
light theme under `:root` and for the dark theme under `.dark`. Components use the semantic
tokens, never palette values directly.

The light theme values come from the Product UI design in Figma: `border` is dark neutral 50
(dividers), `input` is dark neutral 300 (control borders), `primary` is the polar 200 button fill
with dark neutral 400 text and border. The `Button` variants map onto the design's button sets:
`default` is the BlueButton Primary, `secondary` is Secondary, `ghost` is Tertiary and `link` is
Link, while `pink` and `green` are the PinkButton and GreenButton Primary. Sizes `sm` (36px),
`default` (40px), `lg` (44px) and `xl` (48px) match Size sm, md, lg and xl. The `Badge` variants
`success` and `warning` are the design's status badges, and draw their own leading dot.

The home page tokens (`side-column`, `section-rule`, `table-rule`, the `swap-panel-*` and
`balance-*` groups, and the text shades `tertiary-foreground`, `subtle-foreground` and
`fiat-foreground`) come from the home page design. `balance-foreground`, `fiat-foreground`,
`table-rule` and `swap-panel-foreground` hold values that are not on the brand palette, as the
design renders them.

`HomeLayout` (`src/components/home-layout.tsx`) lays out the home page. From the `md` breakpoint
up it fills the viewport under the app bar and the page does not scroll: balances above activity
in the left pane and the 413px swap column on the right. The left pane is the one scroll region.
When balances and activity are taller than the space under the app bar it scrolls, while the app
bar and the swap column stay in place. Below `md` the sections stack as swap, balances, activity
and the page scrolls under the app bar, which the `(configured)` layout keeps at the top.

`next-themes` owns the light or dark choice. It follows the operating system until the visitor
uses the toggle on the `/design` page, then remembers the choice in local storage.

Typography follows the sig.network brand assets in Notion: Elza Text for interface text and
Söhne Mono for numbers, addresses and other technical content.

- Elza Text is served by the sig.network Adobe Fonts kit, linked from `src/app/layout.tsx`, and
  reached through the `font-sans` utility (`--font-sans` in `globals.css`). The kit provides
  weights 300 to 700 in upright and italic.
- Söhne Mono is licensed from Klim Type Foundry. Its WOFF2 files live in `src/app/fonts` and load
  through `next/font/local` (`src/app/fonts/soehne-mono.ts`), reached through the `font-mono`
  utility. Weights 200 (Extraleicht), 300 (Leicht), 400 (Buch) and 500 (Kräftig) are included.

## Adding a UI component

Components come from shadcn/ui (the `base-nova` style, configured in `components.json`):

```bash
yarn shadcn add <component>
```

The CLI writes into `src/components/ui`. Run `yarn format` afterwards, since the generated files
use a different quote style.

## Type checking and linting

- TypeScript 7 runs in strict mode with `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters`, `verbatimModuleSyntax` and `erasableSyntaxOnly`.
- `typedRoutes` is enabled, so `next/link` hrefs and the `PageProps` and `LayoutProps` helpers are
  checked against the routes that exist. `yarn typecheck` regenerates those types first.
- oxlint runs the `react`, `typescript`, `oxc` and `nextjs` plugins with type-aware rules, plus
  `better-tailwindcss/enforce-canonical-classes` for Tailwind class names.
- The React Compiler is enabled in `next.config.ts`, so components are written without manual
  memoisation.
