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
docker compose --env-file .env.local up -d --wait
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

| Script                       | Purpose                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn dev`                   | Start the development server.                                                                                                           |
| `yarn build`                 | Create a production build.                                                                                                              |
| `yarn start`                 | Serve the production build.                                                                                                             |
| `yarn typecheck`             | Generate the Next.js route types, then type check with `tsc`.                                                                           |
| `yarn lint`                  | Lint with oxlint, including its type-aware rules.                                                                                       |
| `yarn format`                | Format with oxfmt.                                                                                                                      |
| `yarn format:check`          | Report files that are not formatted.                                                                                                    |
| `yarn test`                  | Run the unit tests once.                                                                                                                |
| `yarn test:integration`      | Run the integration tests against the local services.                                                                                   |
| `yarn boundaries`            | Fail on a runtime import that crosses the backend boundary.                                                                             |
| `yarn diagram-library`       | Regenerate the per-package diagram library under `docs/diagram-library/` from the code and render its PNGs (see `docs/diagramming.md`). |
| `yarn diagram-library:check` | Fail when a file under `docs/diagram-library/` differs from a fresh generation, is missing or is not generated from the code.           |
| `yarn check`                 | Run the type check, the linter, the format check, the boundary check, the diagram library check and the unit tests in sequence.         |
| `yarn db:generate`           | Regenerate the one SQL migration from the schema and the outbox trigger.                                                                |
| `yarn db:migrate`            | Apply the migration to an empty database.                                                                                               |
| `yarn stack:up`              | Start the compose services (Postgres, Kafka and the explorers) with `.env.local` and wait until they are healthy.                       |
| `yarn stack:down`            | Stop the compose services and delete their volumes, so the database and the broker start empty next time.                               |
| `yarn stack:restart`         | `stack:down`, `stack:up`, then `db:migrate`: a fresh database with the schema applied and an empty history.                             |
| `yarn zk-assets`             | Build the prover keys and ZKIR of the vault and signet contracts under `zk-assets/` (see [Proving keys](#proving-keys)).                |
| `yarn zk-assets:public`      | Copy the vault's bundle under `public/zk-assets/` for the browser to fetch (see [Proving keys](#proving-keys)).                         |

## Layout

| Path                                                       | Contents                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`                                                  | App Router files: the root layout, `error`, `global-error`, `not-found`, `icon.svg`, global CSS.                                                                                                                                                                                          |
| `src/app/(configured)`                                     | Routes that render inside `ConfigProvider`, gated by its layout: `/` and `/design`.                                                                                                                                                                                                       |
| `src/components`                                           | Application React components.                                                                                                                                                                                                                                                             |
| `src/components/ui`                                        | Components written by the shadcn CLI.                                                                                                                                                                                                                                                     |
| `src/components/contexts`                                  | React contexts: each file holds a context, its provider and its `use<Name>` hook.                                                                                                                                                                                                         |
| `src/lib`                                                  | Non-React modules. The files at its root serve every domain: `value-schemas.ts`, `lazy-singleton.ts`, `sweep.ts`, `run-until-aborted.ts`, `coalescing-runner.ts`, `delay-unless-aborted.ts`, `message-of.ts`.                                                                             |
| `src/lib/caller`                                           | The `Caller` type and caller name schema (`caller.ts`), the login credential and its message (`login-credential.ts`), the page's login over the wallet (`wallet-login.ts`), the server's `resolveCaller()` over the credential, and the caller fixtures.                                  |
| `src/lib/config`                                           | Server configuration loading and the client configuration type.                                                                                                                                                                                                                           |
| `src/lib/db`                                               | The Drizzle schema and the Postgres connection pool.                                                                                                                                                                                                                                      |
| `src/lib/kafka`                                            | The Kafka producer and consumer factories and the connection options.                                                                                                                                                                                                                     |
| `src/lib/logging`                                          | The `Logger` port with its field vocabulary, and its pino implementation (see [Logging](#logging)).                                                                                                                                                                                       |
| `src/lib/event`                                            | The event layer: events, the outbox and Kafka publishers, the consumer hub and the outbox relay.                                                                                                                                                                                          |
| `src/lib/repository`                                       | The repository contract every resource's storage implements, and its Postgres base class and an in-memory one.                                                                                                                                                                            |
| `src/lib/testing`                                          | Test helpers: the `mock()` double for any interface and the `RecordingLogger`.                                                                                                                                                                                                            |
| `src/lib/ethereum/transaction-v1`                          | The Ethereum transaction resource, its repository, state machine, state controller, ledger, resolver and event consumer.                                                                                                                                                                  |
| `src/lib/ethereum`                                         | The Ethereum modules the domains share: the account, ERC20 and ERC-4626 readers and the Uniswap quoter.                                                                                                                                                                                   |
| `src/lib/midnight/ethereum-erc20-vault`                    | The ERC-20 vault: its action set, circuit and ledger ports, the isomorphic call building, the page's provider set, signet readers, respond outcome sources, the flusher, and one folder per resource version.                                                                             |
| `src/lib/midnight/ethereum-erc20-vault/vault-request-v1`   | The vault request resource, its repository, state machine, state controller, resolver and event consumer.                                                                                                                                                                                 |
| `src/lib/midnight/ethereum-erc20-vault/activity-v1`        | The activity view: the resource the view projects, its read-only repository, service and adaptor.                                                                                                                                                                                         |
| `src/lib/midnight/ethereum-erc20-vault/caller-operation`   | The lifecycle every caller-started operation shares: its states, state machine, the controller, resolver and event consumer bases the deposit, withdrawal, swap, supply, redeem and approval build on, and the call builder base and the runner every operation's page calls run through. |
| `src/lib/midnight/ethereum-erc20-vault/deposit-v1`         | The deposit resource, its repository, state machine, state controller, resolver, event consumer, service and adaptor, and the call builder and page module the page builds, proves and finalises the deposit's two caller calls with.                                                     |
| `src/lib/midnight/ethereum-erc20-vault/withdraw-v1`        | The withdraw resource, the Send of the UI, with the same set of pieces as the deposit, its own call builder and page module included.                                                                                                                                                     |
| `src/lib/midnight/ethereum-erc20-vault/swap-v1`            | The swap resource and its quote, with the same set of pieces as the deposit, its own call builder and page module included.                                                                                                                                                               |
| `src/lib/midnight/ethereum-erc20-vault/supply-v1`          | The supply resource, the Supply of the Lend tab, and its target (the pinned stata pair with the wrapper's allowance), with the same set of pieces as the deposit, its own call builder and page module included.                                                                          |
| `src/lib/midnight/ethereum-erc20-vault/redeem-v1`          | The redeem resource, the Redeem of the Lend tab, with the same set of pieces as the deposit, its own call builder and page module included.                                                                                                                                               |
| `src/lib/midnight/ethereum-erc20-vault/approval-v1`        | The approval resource and the spender targets the deployer grants, with the same set of pieces as the deposit, its own call builder and page module included.                                                                                                                             |
| `src/lib/midnight/ethereum-erc20-vault/supported-token-v1` | The vault's allowlist as a resource with each token's on-chain metadata, the funds a caller's deposit account holds of it, and their service and adaptor over the ledger and an ERC20 reader.                                                                                             |
| `src/lib/midnight/transaction-v1`                          | The Midnight transaction resource, its repository, state machine, state controller, ledger, resolver and event consumer.                                                                                                                                                                  |
| `src/lib/midnight/wallet`                                  | The wallet layer: the `Wallet` interface, the seed wallet and its facade, the stored seed, and the backend's relayer wallet.                                                                                                                                                              |
| `src/lib/pricing`                                          | Spot prices for display: the price request and price resources, the market source port with its CoinGecko implementation, the cached service and its adaptor.                                                                                                                             |
| `src/lib/midnight`                                         | The Midnight modules every domain shares: the address abbreviation, the browser `Buffer` shim, the in-memory private state provider and the MIP-0031 signed message (`signed-message.ts`) the wallet signs and the server verifies.                                                       |
| `src/server`                                               | The code that runs: the composition root, the server action files, the start-up and the console bridge.                                                                                                                                                                                   |
| `src/instrumentation.ts`                                   | Runs once when the server process starts and calls the start-up in `src/server/start.ts`.                                                                                                                                                                                                 |
| `integration-tests`                                        | The integration tests and their helpers, run with `yarn test:integration` (see [Testing](#testing)).                                                                                                                                                                                      |
| `scripts`                                                  | The boundary guard (`yarn boundaries`) and the diagram library generator (`yarn diagram-library`).                                                                                                                                                                                        |
| `drizzle`                                                  | SQL migrations and their snapshots, written by `yarn db:generate`.                                                                                                                                                                                                                        |
| `zk-assets`                                                | One prover key bundle per contract, built by `yarn zk-assets` and gitignored.                                                                                                                                                                                                             |
| `public/zk-assets`                                         | The vault's bundle as the browser fetches it, copied by `yarn zk-assets:public` and gitignored.                                                                                                                                                                                           |
| `docs`                                                     | `architecture.md`, the design record the backend was built from, and the draw.io diagrams with their style guide `diagramming.md`.                                                                                                                                                        |
| `public/icons`                                             | The sig.network wordmark and swan, in brown (light theme) and white (dark theme) variants.                                                                                                                                                                                                |

Pages and layouts are server components. A component opts into the browser with `'use client'`
only when it needs state, effects or browser APIs, as `src/components/mode-toggle.tsx` does.

## Configuration

Configuration is read from environment variables on the server at request time. Nothing is baked
in at build time, so one build serves every environment. `.env.example` lists the variables:

| Variable                                         | Secret | Purpose                                                                                                                                                                     |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIDNIGHT_NETWORK_ID`                            | No     | `undeployed` or `stagenet`. Selects the default Midnight endpoints and the published contract values.                                                                       |
| `MIDNIGHT_INDEXER_URL`                           | No     | Optional override of the indexer GraphQL endpoint.                                                                                                                          |
| `MIDNIGHT_INDEXER_WS_URL`                        | No     | Optional override of the indexer subscription endpoint.                                                                                                                     |
| `MIDNIGHT_NODE_URL`                              | No     | Optional override of the node RPC endpoint.                                                                                                                                 |
| `MIDNIGHT_PROOF_SERVER_URL`                      | No     | Optional override of the proof server, `http://127.0.0.1:6300` by default. The page proves the deposit's calls through it, so it must be reachable from the browser's host. |
| `MIDNIGHT_SIGNET_CONTRACT_ADDRESS`               | No     | 32-byte hex. Overrides the SDK's published signet singleton address, required for `undeployed`.                                                                             |
| `MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY`            | No     | secp256k1 key in SEC1 hex or `secp256k1:base58`. Overrides the published MPC root key, required for `undeployed`.                                                           |
| `MIDNIGHT_ETHEREUM_ERC20_VAULT_CONTRACT_ADDRESS` | No     | 32-byte hex. Overrides the published ERC20 vault address, required for `undeployed`.                                                                                        |
| `EVM_CHAIN_ID`                                   | No     | Ethereum chain ID. `1`, `11155111` and `31337` have a default RPC.                                                                                                          |
| `EVM_RPC_URL`                                    | No     | Optional override of the RPC endpoint, required for other chains.                                                                                                           |
| `EVM_UNISWAP_QUOTER_ADDRESS`                     | No     | Uniswap's QuoterV2, the price source of a swap quote. Sepolia and the local fork have a default, other chains require it.                                                   |
| `DB_CONNECTION_STRING`                           | Yes    | Postgres connection string. The value in `.env.example` points at the [local database](#local-services).                                                                    |
| `KAFKA_BROKERS`                                  | No     | Kafka bootstrap brokers as comma-separated `host:port`. Server-only: it is not part of the client configuration.                                                            |
| `MIDNIGHT_ZK_ASSETS_ROOT`                        | No     | The root the backend's proof provider searches for every contract's prover keys and ZKIR, `zk-assets/` by default (see [Proving keys](#proving-keys)). Server-only.         |
| `MIDNIGHT_RELAYER_SEED`                          | Yes    | 32-byte hex seed of the backend's own Midnight wallet, which finalises and pays for relayer transactions (see [The relayer wallet](#the-relayer-wallet)). Server-only.      |
| `RESPOND_OUTPUT_SOURCE`                          | No     | Where the backend obtains the bytes an MPC attestation is verified over: `mpc-cache` (default) or `evm-node` (traces the mined transaction on `EVM_RPC_URL`). Server-only.  |
| `MPC_OUTPUT_CACHE_URL`                           | No     | Optional override of the network's MPC output cache, which `@sig-net/midnight` publishes for Stagenet and the local fakenet serves on port 3040. Server-only.               |
| `MIDNIGHT_USER_SEED`                             | Yes    | Tests only: the funded Midnight wallet the integration tests play the user with. The application never reads it.                                                            |
| `LOG_LEVEL`                                      | No     | The least severe server log level written: `debug`, `info` (default), `warn` or `error` (see [Logging](#logging)). Server-only.                                             |
| `LOG_FORMAT`                                     | No     | `json` (default when `NODE_ENV` is `production`), one Cloud Logging shaped object per line, or `pretty` (default otherwise), coloured text. Server-only.                    |

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
live together in `src/components/contexts/ConfigContext.tsx`. `ReactQueryProvider`
(`src/components/contexts/ReactQueryContext.tsx`) wraps it with the one React Query client that
every remote read under the group shares. Client components under the group read the
configuration with the hook:

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
application uses, and the block explorer of the local EVM node:

- Postgres 18 on `127.0.0.1:5432`, with the user, password and database all named `demo`.
- Kafka 4.2 on `127.0.0.1:9092`, a single node in KRaft mode without authentication. Topics are
  created on first use.
- Otterscan 2.11 on `127.0.0.1:5100`, a block explorer whose page the browser runs against the
  anvil fork's own JSON-RPC at `127.0.0.1:8545` (anvil serves Otterscan's `ots_` API). It is
  where the Activity dialog's Ethereum transaction links open on the local stack, so it needs
  the local stack's node to be up.
- Polkadot.js Apps on `127.0.0.1:5300`, the generic Substrate explorer, whose page the browser
  runs against the local Midnight node's WebSocket at `127.0.0.1:9944`. It is where the Activity
  dialog's Midnight transaction links open on the local stack. Apps finds a block, never a
  Midnight transaction by its id, so a link opens the block that holds the transaction, where
  it is the `midnight.sendMnTransaction` extrinsic. The image is published for amd64 only, so
  it runs under emulation on Apple silicon.
- The sig.network explorer (`ghcr.io/sig-net/explorer`) on `127.0.0.1:5400`, whose page the
  browser runs against the local indexer, node and EVM fork. It is where the Activity dialog's
  Sig Network request links open on the local stack, on the request's lifecycle. The local
  stack generates its own Signet contract and MPC root key, so the service reads
  `MIDNIGHT_SIGNET_CONTRACT_ADDRESS` and `MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY` from `.env.local`,
  which is why the services start with `--env-file .env.local`.

`DB_CONNECTION_STRING` and `KAFKA_BROKERS` in `.env.example` point at the first two. Their data
lives in the `full-stack-demo_postgres-data` and `full-stack-demo_kafka-data` Docker volumes and
survives a restart of the containers.

Start them and wait until they accept connections:

```bash
yarn stack:up
```

Stop them and keep the data:

```bash
docker compose down
```

Stop them and delete the data, so the next start begins with an empty database and broker:

```bash
yarn stack:down
```

Reset them in one go, bringing the services back up and applying the migrations to the empty
database. The Midnight chain, the fork and the vault belong to the other stack and are not
touched, so the wallet keeps its coins while the Activity table starts empty:

```bash
yarn stack:restart
```

## Database

The backend reaches Postgres through [Drizzle ORM](https://orm.drizzle.team) on the `pg` driver.

- `src/lib/db/schema.ts` declares every table. It is the source the migrations are generated from.
- `src/lib/db/database.ts` exports `createDatabasePool()` and `createDatabase()`. The composition
  root builds one pool for the server process from `DB_CONNECTION_STRING`.
- `drizzle.config.ts` configures drizzle-kit. It reads `DB_CONNECTION_STRING` from the environment,
  or from `.env.local` when that file exists.
- `scripts/migrate.ts` applies the `drizzle` migration to the database at `DB_CONNECTION_STRING`
  with production dependencies alone. The production image ships it with the `drizzle` folder, and
  a deployment runs `node scripts/migrate.ts` from `/app` before the server starts.

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
untrusted as wire input.

Nothing in this codebase is backwards compatible, the database included: `drizzle` holds one
migration, `0000_schema`, generated from the whole schema with the outbox's insert trigger from
`src/lib/db/outbox-notify.sql` appended, since drizzle derives no trigger from the schema. To
change the schema, edit `src/lib/db/schema.ts`, generate the migration again and commit it:

```bash
yarn db:generate
```

Then reset the local database to it:

```bash
yarn stack:restart
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
a working in-memory repository for flow tests. `RecordingLogger` in
`src/lib/testing/recording-logger.ts` is the logger every unit test hands its subject: it keeps
each line with its level, message and fields (children's bindings merged), so a case asserts on
what was logged. `vitest.config.ts` resolves the `@/` alias and
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
`getBackend()` the server uses, `user-wallet.ts` builds the user's wallet from
`MIDNIGHT_USER_SEED`, `user-deposit.ts`, `user-withdraw.ts`, `user-supply.ts`, `user-redeem.ts`,
`user-swap.ts` and `user-approval.ts` play the browser's deposit, withdraw, supply, redeem,
swap and approval calls (prepared, built and proved through the backend's call builder,
finalised by that wallet with its own DUST fee, then committed) over `user-caller-call.ts`,
which holds the timed finalisation and the mirrored completion output they share, and
`operation-round-trip.ts` plays that wallet for
any caller operation until it completes and deletes the operation and its children afterwards. A test file creates
rows under a caller name of its own and deletes them, its outbox entries included, in
`afterAll`, then stops the backend and ends the pool. The approval, swap, withdraw, supply and
redeem round trips run under the stack's user identity, which deployed the vault, so they delete only the
rows they created. Stop any
dev server before a run: it joins the same Kafka consumer group, so its consumers and outbox
relay would compete with the test's.

| File                                                | Needs                                                                     | Covers                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repository-sql.test.ts`                            | Postgres                                                                  | `SQLRepository`: the round trip, a malformed row refused on read, a skip-locked search.                                                                                                                                                   |
| `backend-lifecycle.test.ts`                         | Postgres, Kafka, the Midnight stack                                       | `start()` runs once, syncs the relayer wallet and sweeps, and `stop()` ends every loop.                                                                                                                                                   |
| `midnight-transaction-ledger.test.ts`               | the indexer, the proof server                                             | `MidnightTransactionLedgerImpl`: an unknown id is pending, an empty transaction proves.                                                                                                                                                   |
| `midnight-transaction-resolve.test.ts`              | Postgres, the proof server, the Midnight stack (the relayer wallet syncs) | An unproven relayer commit is proven and finalised by the relayer wallet into `AwaitingSubmission`, with its row and outbox trail.                                                                                                        |
| `ethereum-transaction-broadcast.test.ts`            | Postgres, the anvil fork                                                  | A signed transaction is broadcast and included, and a second one at a consumed nonce ends `NonceConsumed`.                                                                                                                                |
| `ethereum-erc20-vault-request.test.ts`              | Postgres, the indexer                                                     | Vault request storage, the one-live-request index, a starter's conflict mapping, the readers and the resolver's reads.                                                                                                                    |
| `ethereum-erc20-vault-flush.test.ts`                | the Midnight stack (the relayer wallet syncs)                             | The first flush starts the relayer wallet and submits nothing when nothing is queued.                                                                                                                                                     |
| `ethereum-erc20-vault-approval.test.ts`             | the whole local stack                                                     | A router approval from `startApproval` to `Completed` under the deployer identity, the allowance read back on the fork, both deployer calls finalised by the user wallet.                                                                 |
| `ethereum-erc20-vault-swap.test.ts`                 | the whole local stack                                                     | A deposit and the router approval when the vault lacks it, then a swap of the deposited USDC for EURC at a live quote, the trade read back on the fork, the coin spent net of the change, both caller calls finalised by the user wallet. |
| `ethereum-erc20-vault-withdraw.test.ts`             | the whole local stack                                                     | A deposit, then a send of the deposited USDC from the vault account to a fresh destination, its balance read back on the fork, the coin gone from the wallet, both caller calls finalised by the user wallet.                             |
| `ethereum-erc20-vault-supply.test.ts`               | the whole local stack                                                     | A deposit of the stata underlying and the wrapper approval when the vault lacks it, then a supply into the wrapper, the shares read back on the fork, the coin gone from the wallet, both caller calls finalised by the user wallet.      |
| `ethereum-erc20-vault-redeem.test.ts`               | the whole local stack                                                     | A deposit and a supply, then a redeem of the minted shares, the underlying paid out read back on the fork, the shares gone from the wallet, both caller calls finalised by the user wallet.                                               |
| `ethereum-erc20-vault-deposit-start.test.ts`        | Postgres, the indexer, the proof server, the fork                         | `prepareStartDeposit` assigns, the finalised start call is stored in `AwaitingSubmission` with both events in the outbox, a moved nonce is refused, listing, the early completion refusal, a token the circuit refuses.                   |
| `ethereum-erc20-vault-deposit-call-builder.test.ts` | the indexer, the proof server                                             | `DepositCallBuilder.buildStart` over the backend's providers returns unbound bytes the ledger deserialises as proven. Nothing is written or submitted.                                                                                    |
| `ethereum-erc20-vault-activity.test.ts`             | Postgres                                                                  | The activity view's projection of the newest children and its aggregated states.                                                                                                                                                          |
| `ethereum-local-faucet.test.ts`                     | the anvil fork                                                            | The Ethereum faucet: a fresh account holds the ETH and the USDC it is given, twice over on a second call.                                                                                                                                 |
| `midnight-local-faucet.test.ts`                     | the Midnight stack                                                        | The NIGHT faucet: a fresh wallet holds the NIGHT the genesis wallet sends it, and a shielded address is refused.                                                                                                                          |
| `ethereum-erc20-vault-deposit.test.ts`              | the whole stack                                                           | The end-to-end deposit below.                                                                                                                                                                                                             |

The whole suite takes 45 to 55 minutes (measured at 48.8 minutes over its 20 files and 42 tests,
each of the six operation round trips taking four to fifteen), of which the end-to-end deposit is
four to four and a half:

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
relayer and user wallets of `.env.local` funded. The test starts the backend, plays the browser
(preparing each of the two caller calls, building and proving it through the backend's call
builder, finalising it with the user's wallet paying its fee, and committing it), and funds the
deposit account on the fork with anvil's cheatcodes, while the backend submits it, flushes, sends,
polls the MPC, broadcasts the sweep, and queues and flushes the attestation on its own, as [Deposit lifecycle](#deposit-lifecycle) describes. It then asserts the outcome `minted`, the request `Attested` with an `executed`
attestation, the slot gone from the vault ledger, the sweep `Succeeded`, and the 19 lifecycle
events of the deposit, its two caller calls and its vault request in publication order. A run
takes four to four and a half minutes (whether the MPC's attestation is posted before or after
the sweep that looks for it decides which), of which roughly 90 seconds is waiting for the 30
second sweep on the three legs only a sweep advances, and the ledger is left with no open
request, so runs repeat without cleaning the chain.

## Caller authentication

The caller of every server action is the connected Midnight wallet, and the wallet proves it
holds the key by signing a login. The browser passes a login credential as the first argument
of every action, and `resolveCaller()` (`src/lib/caller/resolve-caller.ts`) verifies it and
names the caller `callers/{caller}`, where the caller id is the 32-byte user address of the key
that signed, in hex (the ledger's `addressFromKey()`). That id names the wallet's unshielded key
on every network, so the names a caller owns survive a change of network. The action compares
every resource name it receives against the caller's name, so a caller only ever creates or
reads under their own caller. The `Caller` type and the name helpers live in
`src/lib/caller/caller.ts`, and `src/lib/caller/caller-fixtures.ts` holds the keys and
credentials the unit tests resolve: MIP-0031's published test keys, which must never hold funds.

The credential (`loginCredentialSchema` in `src/lib/caller/login-credential.ts`) is
`{ issuedAt, signature }`. `issuedAt` is the moment of signing in ISO 8601 UTC, and `signature`
is the wallet's answer to the DApp connector's `signData` without its `data` field:
`{ scheme, verifyingKey, signature }` in bare lower-case hex, the scheme spelled as the connector
spells it (`schnorr_bip340` or `ecdsa_secp256k1_sha256`). The text the wallet signs is
`full-stack-demo:login:{networkId}:{issuedAt}`, so a signature is bound to this application, one
network and one moment. The server never reads the message from the credential: it rebuilds it
from its own network and the credential's `issuedAt`, refuses a credential older than five
minutes (`LOGIN_WINDOW_MS`) or dated in the future, verifies the signature with the ledger's
`verifySignature()`, and only then derives the caller. A captured credential therefore replays
for at most five minutes, and only at this application on this network.

What the wallet signs is not that text itself. A Midnight wallet prefixes the data a DApp hands
to `signData`, so a signed message can never be a well-formed transaction, and the exact bytes
are specified by MIP-0031, Midnight Message Signing
(`mips/mip-0031-message-signing/mip-0031-message-signing.md` in
`midnightntwrk/midnight-improvement-proposals`, merged on 16 October 2026): the signed message
is `midnight_signed_message:` followed by the payload's byte length in decimal, a colon and the
payload, and the signature binds its SHA-256 digest under BIP-340 Schnorr or ECDSA over
secp256k1. The DApp connector specification's Signing section states the same prefix in one
sentence, and the installed connector package (4.0.1) says only that the data is prepended with
the right prefix. `src/lib/midnight/signed-message.ts` holds that construction
(`signedMessageOf()`), the connector's payload decoding (`signDataPayloadOf()`, which refuses
what the declared encoding does not accept with the connector's `InvalidRequest`), the wire form
of a signature (`messageSignatureSchema`) and the verification (`verifyMessageSignature()`, over
the ledger's `verifySignature()`, which hashes the message itself and refuses an ECDSA signature
with a high `s`). `src/lib/midnight/signed-message.test.ts` runs the MIP's own test vectors
(`mip-0031-vectors.json`, verbatim from the proposal) against all of them, so the seed wallet
signs exactly the bytes a browser wallet extension signs, and the server accepts exactly what
the MIP's verifier accepts.

In the browser, `CallerProvider` (`src/components/contexts/CallerContext.tsx`) logs the caller
in once per wallet generation through `loginWithWallet()` (`src/lib/caller/wallet-login.ts`),
which asks the wallet to sign the login text (`encoding: 'text'`, `keyType: 'unshielded'`) and
holds the credential in page memory only: a reload or a disconnect asks the wallet again, and
nothing of it reaches local storage. `useCaller().login` is the `CallerLogin`: its
`verifyingKey` is the caller's identity, which the page keys its queries on, never a credential,
and `credential()` answers the current credential, or one signed afresh once less than a minute
of the window remains, so a call in flight never carries one that expires on arrival. The seed
wallet signs silently; a browser wallet extension will prompt, at most once per window and never
while the page is idle. `useCaller().loginError` carries the wallet's refusal.

The vault still needs a 32-byte secret, the value of the contract's `callerSecretKey` witness,
which the application calls the vault secret
(`src/lib/midnight/ethereum-erc20-vault/vault-secret.ts`). It is the witness of every caller
circuit, and its contract commitment (`userCommitmentOf()`) picks the deposit account, so one
caller may run several vault accounts from one wallet. The secret never reaches the server: the
browser sends the commitment where the server needs the deposit account (`prepareStartDeposit`,
`startDeposit`, `getVaultReadiness` and `listDepositAccountFunds` take a `userCommitment`), and
the server derives the account with `depositAccountOf()`
(`src/lib/midnight/ethereum-erc20-vault/deposit-account.ts`, the same function the browser uses).

- A user sets the vault secret through the vault secret popover
  (`src/components/vault-secret-popover.tsx`, the crossed-out eye beside the wallet button in
  the app bar, dotted green once set) or the Vault secret item of the mobile menu, by pasting a
  secret or generating a fresh one, and the panel (`src/components/vault-secret-panel.tsx`) then
  shows the commitment with a copy button for the secret, the deposit account and a Clear secret
  button. `CallerProvider` (`src/components/contexts/CallerContext.tsx`) logs the caller in with
  the connected wallet and keeps the secret in local storage
  (`src/lib/midnight/ethereum-erc20-vault/vault-secret-storage.ts`), so a reload keeps the same
  vault account until Clear secret removes it, and a stored value that is not 32 bytes in hex
  counts as unset until a new one replaces it. `useCaller()` exposes the login, the secret, its
  commitment and the deposit account.
- An action that builds a call needs both: the login to name the caller and the secret as the
  witness. A read such as the activity list needs the login alone.

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

1. **Start (the user).** The browser holds the vault secret, the 32-byte witness of the vault's
   two user circuits, and a connected Midnight wallet, whose login names the caller.
   It calls `prepareStartDeposit(credential, { depositRequest, wallet, userCommitment })`,
   where `wallet` is the wallet's coin and encryption public keys and `userCommitment` the
   contract's commitment of the vault secret, which picks the deposit account, and the server
   answers with the inputs it decides
   without writing anything: a random slot `inIndex`, the EVM nonce the sweep will use and the
   sweep's gas. The browser builds the `startDeposit` circuit call with the vault secret as the
   witness (the contract's asserts fire here, before anything is sent), proves it through the
   proof server, and has the wallet balance it with its own coins and DUST fee, sign and
   finalise it. It then calls `startDeposit` with the request, the wallet keys, the `inIndex` and
   `evmNonce` it built against, and the finalised bytes. The server derives the deposit account
   and the recipient again, refuses a nonce that moved since the preparation, then in one
   database transaction stores the deposit in `AwaitingStartTransaction` and commits the call as
   a Midnight transaction with signer `caller` under it, in `AwaitingSubmission`.
2. **The caller's call (the backend).** The Midnight transaction resolver submits the finalised
   bytes to the node (`AwaitingInclusion`) and watches the indexer until the ledger records them
   (`Succeeded`).
   Meanwhile the user funds the deposit account on the EVM chain with the amount and the gas for
   the sweep (the end-to-end test does this with anvil's cheatcodes).
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
   relayer's `queueAttestation` call, which checks the post's signature over the output's width
   and hash and so needs no output (`AwaitingAttestationFlush`), the flusher flushes the
   attestation, and the request is `Attested`. The output itself is presented to the complete
   circuit, which checks it against the recorded width and hash.
5. **The ledger is the acknowledgement.** Every step of the request is recorded only when the
   vault ledger, read through `requestStage()`, or the singleton's posts show it done. A step is
   never inferred from a child transaction's outcome: a child that failed is replaced while the
   ledger shows its step undone, and a child that succeeded still waits for the ledger. The
   deposit's two caller calls get the same treatment, since a node can apply bytes whose
   acknowledgement never came back: the deposit resolver reads the ledger before it believes a
   failed start or complete.
6. **Complete (the user).** The request's `attested` event nudges the deposit to
   `AwaitingCompletion`, the one state after the start that waits for the user. The browser calls
   `prepareCompleteDeposit(credential, { name, wallet })`, which answers with the attested
   request's id, output kind and output, builds the `completeDeposit` call from them under a
   fresh random mint nonce, proves and finalises it as in step 1, and calls `completeDeposit`
   with the name, the wallet keys and the finalised bytes. The server stores
   `AwaitingCompleteTransaction` and commits the call as a second caller transaction in
   `AwaitingSubmission`, which repeats step 2. Its `succeeded`
   event completes the deposit with `outcome` `minted` (the attested sweep executed and returned
   true) or `closed`. A failed complete returns the deposit to `AwaitingCompletion`, where the
   user may complete again, unless the ledger shows the request settled, in which case the
   deposit is completed from the stored attestation.
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
nonce when the start is prepared and checks it again when the start is committed: the higher of the account's pending transaction count on the chain and one above
the highest nonce held by the caller's live deposits. No two requests of one deposit account
share a nonce, so neither the deposit nor the vault request has a state for the case, and the
vault request resolver logs it as an invariant violation if it ever sees it.

## Midnight transactions

`src/lib/midnight/transaction-v1` carries one circuit call from built to on chain. The states
name what the row waits for (`AwaitingProof`, `AwaitingWallet`, `AwaitingSubmission`,
`AwaitingInclusion`, then `Succeeded` or `Failed` with a `failure` reason),
the legal transitions and the fields each state holds are the table in
`transaction-state-machine.ts`, and
`MidnightTransactionStateController` is the only writer, one method per action, each publishing the
lifecycle event of the state entered. `MidnightTransactionStateResolver` does what the current state
needs through the `MidnightTransactionLedger` port and applies one transition, and
`MidnightTransactionEventConsumer` nudges it on every lifecycle event. Every lifecycle event carries
the transaction's `name` and its `parent`, so the consumer of the parent resource matches on
the parent's collection without a read.

A transaction names its `signer`: `caller` when the caller's browser wallet balances, pays for
and signs it, `relayer` when the backend's own wallet does, which is the case for every
permissionless vault circuit (flushes, sends, attestation queues). `AwaitingWallet` is the
relayer's to-do: the resolver finalises a relayer transaction through the `RelayerWallet` port
and moves it to `AwaitingSubmission`. A caller transaction is committed finalised and enters
`AwaitingSubmission` directly, and the state machine refuses a caller row in `AwaitingProof` or
`AwaitingWallet`.

A call is committed with one of two kinds of bytes, and the bytes decide the state it enters
(`ENTRY_STATE_BY_CALL` in `transaction-state-machine.ts`): `unprovenTx`, built on the backend
for a permissionless circuit, enters `AwaitingProof` and, once proven, waits in `AwaitingWallet`
for the relayer, and `finalizedTx`, balanced, paid for, signed and finalised by the caller's
wallet, enters `AwaitingSubmission`, from where it is submitted and watched like any other. From
`AwaitingSubmission` on, a row holds `unboundTx` only when the backend proved it.

The caller's wallet pays the DUST fee of its own two calls: it balances its shielded and
unshielded coins and its DUST into the call, signs and finalises it
(`Wallet.balanceUnsealedTransaction`, which the seed wallet runs as the wallet SDK's
`balanceUnboundTransaction` over every token kind, then `signRecipe` and `finalizeRecipe`), and
the server stores the finalised bytes as they arrive. The fee is taken in
the guaranteed phase, so the caller pays for a call whose fallible phase fails. Every operation's
caller calls take this path (see
[Deposit lifecycle](#deposit-lifecycle),
[ERC-20 vault withdraw API](#erc-20-vault-withdraw-api),
[ERC-20 vault supply API](#erc-20-vault-supply-api),
[ERC-20 vault redeem API](#erc-20-vault-redeem-api),
[ERC-20 vault swap API](#erc-20-vault-swap-api) and
[ERC-20 vault approval API](#erc-20-vault-approval-api)).

`MidnightTransactionLedgerImpl` is the ledger behind the local or stagenet services: `prove`
deserialises the unproven bytes and proves them through the proof server with the prover keys
under `MIDNIGHT_ZK_ASSETS_ROOT`, `submit` sends the wallet's finalised bytes to the node
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
(`seed-wallet-facade.ts`): the keys derive from `MIDNIGHT_RELAYER_SEED` at construction,
`finalize` balances, signs and finalises an unbound transaction with it (see
[Midnight transactions](#midnight-transactions)). One instance syncs per
process: the backend's `start()` starts it the moment the server starts, since a sync can take
minutes on a long chain (the local stack's short chain syncs in a second or two, which the
`relayer wallet synced` line reports in its `durationMs`, and a `relayer wallet syncing` line
reports each of its three wallets' position at most every 10 seconds until then), a `finalize`
that arrives mid-sync waits on that start, and an instance that was never started refuses it.
Next.js evaluates instrumentation and request code as separate module graphs, each with its own
backend, so `createBackend()` keeps the wallet in a process-wide slot: instrumentation's backend,
built before any request is served, builds and starts it, and the request graph's backend reuses
it, so readiness reads the DUST of the one wallet that syncs.
`provider()` hands the synced wallet to the SDK as the wallet and midnight provider slots of a
midnight-js provider set, so the SDK balances and submits a call itself, and it starts the wallet
when nothing has. The wallet's public keys go into every permissionless circuit call it will later
balance. The wallet must hold NIGHT registered for DUST on the configured network. On the local
stack it is one of the wallets the stack's test harness funded.

### Vault circuits and ledger

`src/lib/midnight/ethereum-erc20-vault/vault-circuits.ts` is the port that builds the circuit
calls the backend makes as unproven transactions in hex, one method per circuit, all of them
permissionless (`sendDeposit`, `queueAttestation` and the other operations' sends). Its
implementation binds the vault's generated contract to the prover keys under
`zk-assets/ethereum-erc20-vault/` with compact-js and builds each call with midnight-js's
`createUnprovenCallTx`, under a private state provider that lives for that one call
(`src/lib/midnight/memory-private-state-provider.ts`): the permissionless circuits prove under
a random secret with the relayer's wallet keys. The building itself is `vault-call.ts` beside the port, which the
implementation calls for every circuit. The call builder reads the wallet's public keys for
every circuit, so every caller circuit takes them as arguments. The deposit's, the
withdrawal's, the supply's, the redeem's, the swap's and the approval's caller circuits are
built in the page:
`caller-operation/caller-call-builder.ts` (`CallerCallBuilder`) builds and proves a caller
call to unbound bytes over `vault-call.ts` and `transaction-v1/prove-transaction.ts`,
`deposit-v1/deposit-call-builder.ts` (`DepositCallBuilder`),
`withdraw-v1/withdraw-call-builder.ts` (`WithdrawCallBuilder`),
`supply-v1/supply-call-builder.ts` (`SupplyCallBuilder`),
`redeem-v1/redeem-call-builder.ts` (`RedeemCallBuilder`),
`swap-v1/swap-call-builder.ts` (`SwapCallBuilder`) and
`approval-v1/approval-call-builder.ts` (`ApprovalCallBuilder`, whose start builds the circuit
the approval's kind names) name each operation's circuits over it, the page's provider set
comes from `browser-vault-call-providers.ts` (the indexer, the prover material fetched from
the page's origin, the proof server), and `deposit-v1/browser-deposit-calls.ts`,
`withdraw-v1/browser-withdraw-calls.ts`, `supply-v1/browser-supply-calls.ts`,
`redeem-v1/browser-redeem-calls.ts`, `swap-v1/browser-swap-calls.ts` and
`approval-v1/browser-approval-calls.ts` drive the builders for the dialogs, the Lend tab, the
Swap panel, the admin page's spender list and the Activity table's auto-completion. Each
module is one descriptor per call over `runCallerCall()` in
`caller-operation/run-caller-call.ts`, the runner every caller call from the page goes through:
it asks the server to prepare, builds and proves the call from the assigned inputs with the
vault secret as its witness, has the wallet finalise it with its own coins and DUST fee, and
asks the server to record the finalised bytes, reporting each stage (`CallerCallStage`) as it
begins, throwing a contract assert while building as the vault refusing the operation's noun,
and running once more from the preparation when a refusal matches the `retryOnce` option (the
deposit's moved nonce). The server inspects the bytes no further: the operation follows its
child transaction's outcome, and the resolver reads the vault ledger only when a child failed
(see [Vault requests](#vault-requests)). `startWithdraw`,
`startSupply`, `startRedeem` and `startSwap` each surrender a coin the caller's wallet funds, so
their finalised bytes carry the wallet's shielded inputs, the transient the circuit consumes and
the change beside the DUST fee.

`vault-ledger.ts` is the read port over the vault contract's public state through the indexer,
and `requestStage()` beside it is the pure function that places a request on the vault's
pipeline (`queued`, `flushed`, `sent`, `attestationQueued`, `attestationFlushed`, `settled`)
from the six ledger maps it reads. Every chain step the backend takes is read back from there,
never inferred from its own transaction's outcome.

### Proving keys

Every circuit call is proved through the proof server: the deposit's, the withdrawal's, the
supply's, the redeem's, the swap's and the approval's caller calls by the page, so the caller
secret embedded in the unproven bytes never reaches the backend, and every other circuit by the
backend. The SDK's `ProvingProvider` has one implementation, an HTTP client
for that server, and the server holds no contract keys: on every `/check` and `/prove` call the
client reads the circuit's prover key and ZKIR from a bundle and sends them with the request. The ledger is per chain and the keys
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
launcher with the compiler version the package pins. The proof server logs the duration of every
call it answers (`docker logs midnight-proof-server --tail 40` shows the latest): on the local
stack its `/prove` calls take 0.2 to 5.6 seconds, half of them under 0.7 seconds, over 477 calls
read from that log.

The browser fetches the vault's bundle from the page's own origin under
`/zk-assets/ethereum-erc20-vault/`, where `yarn zk-assets:public` copies it after `yarn zk-assets`
(into `public/zk-assets/`, gitignored). The fetch provider verifies each artefact against the
bundle's manifest before it is sent to the proof server.

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
node's message. `status` reads the sender's transaction count at the finalised block first and
the receipt only once a finalised block holds a transaction at that nonce: a receipt means `mined` or `reverted` by its
status, no receipt means `nonceConsumed`, and a count at or below the nonce means `pending`.
The resolver reads the sender and nonce from the signed bytes, so the row stores neither. The
backend builds the provider with ethers' request cache off (`cacheTimeout: -1`), since a cached
null receipt would make a mined transaction look like a consumed nonce. As on Midnight, the
node's refusal and the chain's verdict are two actions: `recordRejection` applies only from
`AwaitingSubmission` and `recordFailure` only from `AwaitingInclusion`, so a stale duplicate
broadcast cannot write `Failed` over a transaction the node holds.

### Finality

Every Ethereum value the application acts on is read at the `finalized` block tag
(`FINALIZED_BLOCK_TAG` in `src/lib/ethereum/finality.ts`), so nothing it acts on can be reorganised
away:

- ETH balances (`EthereumAccountReaderEthersImpl`): the deposit account and vault account readiness
  checks.
- ERC20 balances, allowances and metadata (`Erc20ReaderEthersImpl`): the deposit dialog's funds
  line, the spenders table and the supply allowance gate.
- Transaction outcomes (`EthereumTransactionLedgerEthersImpl.status`): a transaction mined in a
  block not yet finalised stays `pending`, and its row stays `AwaitingInclusion`.

Prices read at the head: the Uniswap quote and the ERC-4626 spot price. The deposit service reads
the deposit account's nonce at `pending` so that it counts sweeps still in the mempool.

Finality costs about 15 minutes on Sepolia, where the finalised block trails the head by roughly
70 blocks, and two blocks (about two seconds) on the local anvil fork. A funding transaction sent
to a deposit account therefore counts toward readiness only once its block is finalised. The page
says so beside every finalised value (`FINALITY_NOTE`).

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
(`getSignedEvmTransaction`, judged against the row's `signerAccount`: the deposit account for a
deposit, the vault account for a swap or an approval) and the attestation posts.
Every read walks the singleton's whole event history from the indexer, since a row carries no
block to bound the walk by. `respond-outcome-source.ts` is the port that obtains the bytes an
attestation is verified over, which travel off chain: `RESPOND_OUTPUT_SOURCE` selects
`RespondOutcomeSourceEvmNodeImpl`, which traces the mined transaction on `EVM_RPC_URL` with
`debug_traceTransaction` and recomputes the bytes as the MPC does, or
`RespondOutcomeSourceMpcCacheImpl` (the default), which downloads the object the MPC cached in
the network's output cache. Either checks each post over its candidate with the vault's pinned
response key and keeps the first that verifies. The row stores the verified attestation as five
columns (`attestationBlockHeight`, `attestationOutputKind`, `attestationDigest`,
`attestationSignature` as `bigR.x || bigR.y || s || recoveryId` in hex, `attestationOutput`),
and `vault-request-attestation.ts` rebuilds the event the queue circuit takes from them, with
the output's width and hash the post carries recomputed from the stored output.

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

## Logging

The server writes structured lines through one port, `Logger` in `src/lib/logging/logger.ts`.
`debug`, `info`, `warn` and `error` each take a constant message and a flat record of fields, and
`child(fields)` returns a logger that writes those fields on every line. `createBackend()` builds
the root logger first, with pino (`src/lib/logging/logger-pino-impl.ts`) from `LOG_LEVEL` and
`LOG_FORMAT`, and hands every component a child that names it in `component`: the class name, or
`sweep`, `runEventConsumerHub`, `runOutboxEntryProcessor` and `Backend` for the loops and the
lifecycle. Each module graph builds its own backend, so each has its own logger from the same
configuration. The browser does not log through it.

### Levels

| Level   | What a line at this level reports                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error` | Work was lost or an invariant broke, and a person must look. The line carries `err`.                                                                                                        |
| `warn`  | Degraded but handled: cached spot prices served after a failed refresh, a lost node acknowledgement left to the ledger, a traced output that does not decode.                               |
| `info`  | What a deployed instance says at the default level: the process lifecycle (`backend started`, `relayer wallet synced`, `sweep running`, `backend stopped`) and every create and transition. |
| `debug` | The mechanics: adaptor calls, database transactions, events on their way through the outbox and Kafka, resolves, ledger and circuit calls, flushes and sweep passes, with durations.        |

Each line is written once, by the component that made the decision it reports, never by its
caller:

| Message                                                                                                                        | Level        | Written by                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------- |
| `method called`                                                                                                                | debug        | Every adaptor method, with `method` and, for a caller's call, `caller`.                |
| `transaction opened`, `transaction committed`, `transaction rolled back`                                                       | debug        | `UnitOfWork`, with `durationMs`. A call that joins an open transaction writes nothing. |
| `resource created`, `transition applied`                                                                                       | info         | The state controllers' create methods and `transition()`.                              |
| `event queued`                                                                                                                 | debug        | The outbox publisher, with `event`, `eventId` and `key`.                               |
| `outbox batch relayed`                                                                                                         | debug        | The outbox processor, with `count`, when a batch held entries.                         |
| `event sent`                                                                                                                   | debug        | The Kafka publisher.                                                                   |
| `event received`, `event dispatched`                                                                                           | debug        | The consumer hub, with `partition` and `offset`, then the `count` of consumers.        |
| `handling event`                                                                                                               | debug        | `LifecycleEventConsumer` and the flush consumer, with the `resource` the event nudges. |
| `resolving`, `state conflict swallowed`, `resolve failed`                                                                      | debug, error | The resolvers. A failed resolve in a sweep is an error, a swallowed conflict is debug. |
| `transaction proved`, `transaction submitted`, `transaction broadcast`, `transaction already mined`, `transaction status read` | debug        | The Midnight and Ethereum ledgers, with `txId` and `durationMs`.                       |
| `circuit call built`                                                                                                           | debug        | The vault circuits, with `circuit` and `durationMs`.                                   |
| `flush started`, `flush landed`, `nothing to flush`, `flush lost a race, running again`, `flush failed`                        | debug, error | The flusher. Only a failed flush is an error.                                          |
| `sweep task ran`, `sweep pass ended`, `sweep task failed`                                                                      | debug, error | The sweep, with `task` and `durationMs`.                                               |
| `relayer wallet syncing`                                                                                                       | info         | `RelayerWalletSeedImpl` while its first sync runs, with each wallet's position.        |

A `transition applied` line is written inside the database transaction that holds the write, so a
transition whose transaction then rolls back is followed by `transaction rolled back`.

### Fields

The message is a constant lower-case fact, so lines group by it, and everything a line is about
goes in a field. `LogFields` is the vocabulary, and a field literal with any other key does not
compile:

| Field                                           | Value                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `component`                                     | The class or loop that wrote the line.                                                                  |
| `resource`                                      | A resource name, such as `callers/{caller}/deposits/{deposit}`.                                         |
| `parent`                                        | The resource a child resource serves, on a Midnight transaction, Ethereum transaction or vault request. |
| `state`, `fromState`, `toState`                 | A resource's state when the line was written, and a transition's two ends.                              |
| `action`                                        | The state machine action a transition applied or a conflict refused.                                    |
| `event`, `eventId`, `key`                       | An event's type, id and Kafka key. The key is the name of the resource the event is about.              |
| `partition`, `offset`                           | Where a consumed event sat on the topic.                                                                |
| `caller`                                        | The caller's derived name, `callers/{caller}`.                                                          |
| `method`                                        | The adaptor method a server action reached.                                                             |
| `task`                                          | A sweep task.                                                                                           |
| `circuit`, `txId`, `requestId`                  | A vault circuit, a Midnight transaction id or Ethereum hash, a signet request id.                       |
| `outcome`, `blockHeight`, `lastSeen`            | What a ledger read reported, and the block heights a vault queue check compared.                        |
| `count`, `durationMs`, `intervalMs`             | How many, how long, and how often.                                                                      |
| `networkId`, `chainId`, `logLevel`, `logFormat` | The configuration summary on `backend started`.                                                         |
| `shieldedApplied`, `shieldedHead`               | The last indexer update id the shielded wallet applied, and the head it syncs towards.                  |
| `unshieldedApplied`, `unshieldedHead`           | The same for the unshielded wallet.                                                                     |
| `dustApplied`, `dustHead`                       | The same for the DUST wallet.                                                                           |
| `err`                                           | The error the line reports.                                                                             |

A line never carries a resource object, service arguments, a `Caller`, the vault secret, a seed,
a secret key or a transaction body. The flat field types keep objects out, and `caller` is
always the derived name.

### Formats

`pretty`, the default outside production, writes coloured text through pino-pretty in the
server process itself, with no worker thread. `json`, the default when `NODE_ENV` is
`production`, writes one object per line in the shape Cloud Logging reads from a container's
stdout:

```json
{
  "severity": "INFO",
  "timestamp": "2026-10-15T08:12:12.516Z",
  "component": "Backend",
  "networkId": "stagenet",
  "chainId": 11155111,
  "logLevel": "debug",
  "logFormat": "json",
  "count": 10,
  "intervalMs": 30000,
  "message": "backend started"
}
```

- `severity` is `DEBUG`, `INFO`, `WARNING` or `ERROR` (`CRITICAL` for an SDK `fatal`),
  `message` is the line's summary, and `timestamp` is RFC 3339 in UTC with milliseconds.
- `err` holds the error's `type`, its `message` with every cause's message appended, and its
  `stack` with every cause's stack. An error line also carries the stack in `stack_trace`, the
  field Error Reporting reads.
- A bigint field is written as its decimal string.
- Fields named `vaultSecret`, `secret`, `secretKey` or `seed`, at the top level or one level
  down, are written as `[redacted]`. Application code cannot name them, so this guards what the
  SDKs log.
- The midnight-js SDK writes through the vault providers' `loggerProvider`, a child tagged
  `component: 'midnight-js'`.
- In json format the start-up routes `console.debug`, `log`, `info`, `warn` and `error` through a
  `component: 'console'` child (`src/server/console-bridge.ts`), so the output of Next.js and the
  SDKs in the server process is one json line per call with a severity. The message is the
  arguments as the console formats them, and the first Error among them is `err`. Application
  code never calls the console: lint fails a `console` call under `src`. Under `next dev` the
  CLI's banner and request lines stay plain text.

In the Logs Explorer each field sits under `jsonPayload`, so `jsonPayload.message="transition
applied" AND jsonPayload.toState="Failed"` lists every resource that failed, and
`jsonPayload.component="FlusherImpl"` one component's story.

### Reading one deposit's trail

Run the server with `LOG_LEVEL=debug` and `LOG_FORMAT=json` and save its stdout to
`server.log`. Every resource a caller owns is named under `callers/{caller}`, every child names
the resource it serves in `parent`, and every event's key is the name of the resource it is
about. `fromjson?` skips the plain-text lines. With the deposit's name in `NAME`, this shows the
deposit's creation, each of its transitions and resolves, its events, and the creation and
transitions of the Midnight transactions and the vault request it parents:

```bash
jq -cR --arg r "$NAME" 'fromjson? | select(.resource == $r or .parent == $r or .key == $r)' server.log
```

Running it again with the vault request's name in `NAME` shows the request's flush, send,
signature, broadcast and attestation steps, with the relayer's Midnight transactions and the
Ethereum broadcast it parents. With `callers/{caller}` in `CALLER`, this shows everything the
caller did, from each `method called` to every resource's last transition:

```bash
jq -cR --arg c "$CALLER" 'fromjson? | select(.caller == $c or ((.resource // "") | startswith($c + "/")))' server.log
```

## ERC-20 vault deposit API

`src/lib/midnight/ethereum-erc20-vault/deposit-v1` is the resource-oriented API for vault
deposits, designed in `docs/architecture.md` under Deposit API (the design keeps its own state
names, and its opening section maps them to the ones built here). This UI is its only client, so
it is exposed as server actions rather than HTTP routes. A deposit is named
`callers/{caller}/ethereum-erc20-vault-deposits/{deposit}`, where the caller is the depositor's
caller id (the 64-character hex user address of their wallet's unshielded key) and the deposit id
is a UUID the server assigns.

A deposit is a resource with a lifecycle. Each state names what the deposit waits for, so it is a
to-do for exactly one actor:

| State                         | Waits for                                                                            | Actor                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| `AwaitingStartTransaction`    | the browser-built `startDeposit` call to be paid for by the relayer and included     | the resolvers                         |
| `AwaitingVaultRequest`        | the vault request behind the deposit to be attested                                  | the backend (vault request lifecycle) |
| `AwaitingCompletion`          | the user to complete the deposit, or the sweep to see it settled on the vault ledger | the user, then the resolvers          |
| `AwaitingCompleteTransaction` | the browser-built `completeDeposit` call to be paid for by the relayer and included  | the resolvers                         |
| `Completed`                   | nothing: `outcome` is `minted` or `closed`                                           |                                       |
| `Failed`                      | nothing: `failure` is `StartFailed`, `error` carries the child's message             |                                       |

A deposit holds the caller's request (`erc20Address`, `amount`) and the fields the server assigns
when the start is prepared and derives or checks again when it is committed: `inIndex` (a random 64-bit slot in the vault's request buffer), `depositAccount` (the
EVM account the user funds and the MPC sweeps from, derived from the MPC root key, the vault
address and the contract's commitment of the vault secret), `recipient` (the shielded address of
the wallet the start call was built for, which the completion mints to and refuses any other
wallet for), `evmNonce` (the higher of the
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
  The four user actions take the browser wallet's public keys (`wallet: { coinPublicKey,
encryptionPublicKey }`, 32 bytes each in hex): the browser's call builder reads them for every
  circuit, and `completeDeposit` mints to the coin public key. `prepareStartDeposit` and
  `prepareCompleteDeposit` answer with the circuit's inputs (`DepositStartInputs`,
  `DepositCompleteInputs` in `deposit.ts`) and write nothing.
- `deposit-service-adaptor.ts` is `DepositServiceAdaptor`, which only translates: the secret
  becomes a `Caller`, the arguments are validated, the service is called, and its result becomes
  `{ ok: true, deposit }` (`{ ok: true, inputs }` for a preparation) or `{ ok: false, error }`. A
  state conflict, a recipient mismatch, a nonce that moved since the preparation
  (`DepositNonceConflict`, after which the browser prepares and builds again) are `{ ok: false }`
  results. The server actions the UI calls, `prepareStartDeposit`,
  `startDeposit`, `prepareCompleteDeposit`, `completeDeposit`, `getDeposit` and `listDeposits`
  in `src/server/actions/deposit-actions.ts`, each forward to it. Amounts cross as `bigint`.

The browser builds, proves and finalises each caller call between the preparation and the
commit. Building reads the vault's state from the indexer and runs the circuit in the page, which
is where the contract's own asserts fire (the vault refusing the token, for example, throws
`failed assert: ...` from the builder), so a refused call never reaches the server. The caller's
wallet pays the call's DUST fee, and the server inspects neither the finalised bytes nor the
inputs the call carries. `startDeposit` reads the deposit account's nonce from the EVM chain.
Each service method opens one transaction around the controller call that stores the deposit's
step and commits the finalised call as a Midnight transaction in `AwaitingSubmission` under it.
The adaptor opens no transaction for these two methods, and the read and prepare methods open
none.

The backend takes the deposit from the commit until `AwaitingCompletion`: the resolver submits
the finalised bytes. The browser then prepares, builds and finalises the complete call the same
way.

```tsx
'use client'

import {
  completeDeposit,
  prepareCompleteDeposit,
  prepareStartDeposit,
  startDeposit,
} from '@/server/actions/deposit-actions'

const wallet = { coinPublicKey, encryptionPublicKey }
const depositRequest = { erc20Address, amount: 1000000n }
const prepared = await prepareStartDeposit(credential, {
  depositRequest,
  wallet,
  userCommitment,
})
// ... build and prove the startDeposit call from prepared.inputs, finalise it with the wallet
const started = await startDeposit(credential, {
  depositRequest,
  wallet,
  userCommitment,
  inIndex: prepared.inputs.inIndex,
  evmNonce: prepared.inputs.evmNonce,
  finalizedTx,
})
// ... fund started.deposit.depositAccount, wait for AwaitingCompletion
const inputs = await prepareCompleteDeposit(credential, { name: started.deposit.name, wallet })
// ... build, prove and finalise the completeDeposit call from inputs.inputs
const completed = await completeDeposit(credential, {
  name: started.deposit.name,
  wallet,
  finalizedTx: completeFinalizedTx,
})
```

## ERC-20 vault withdraw API

`src/lib/midnight/ethereum-erc20-vault/withdraw-v1` is the resource-oriented API for sending a
vault token back out to Ethereum, which the UI calls Send. A withdrawal is named
`callers/{caller}/ethereum-erc20-vault-withdraws/{withdraw}` and runs the caller operation's
six states under its own names, as the deposit does: `AwaitingStartTransaction` while the
page-built `startWithdraw` call is paid for by the relayer and included, `AwaitingVaultRequest`
while the vault request behind it runs to `Attested` (the MPC signs `transfer(destEvmAddress,
amount)` from the vault account), `AwaitingCompletion` for the user, or the sweep once the
ledger shows the request settled, `AwaitingCompleteTransaction` while the page-built
`completeWithdraw` call is paid for and included, then `Completed` with `outcome` `sent` (the
transfer executed and returned true) or `refunded` (the complete circuit re-minted the
surrendered amount to the caller), or `Failed` with `StartFailed`.

A withdrawal holds the caller's request (`erc20Address`, `amount`, `destEvmAddress`), the slot
`inIndex` the server assigns when the start is prepared, and `vaultAccount`, which the server
derives when the start is committed. The caller's two calls take the same path as the deposit's
(see [ERC-20 vault deposit API](#erc-20-vault-deposit-api)): the browser calls
`prepareStartWithdraw(credential, { withdrawRequest })`, which answers with `{ inIndex }`
(`WithdrawStartInputs` in `withdraw.ts`) and writes nothing, builds the `startWithdraw` call
with the vault secret as the witness and the connected wallet's keys (`WithdrawCallBuilder`),
proves it, and has the wallet balance it with its own coins and DUST fee, sign and finalise it.
The circuit surrenders a fresh coin of the token worth exactly `amount`, so this balancing spends
the wallet's own coins of that vault token and leaves the change. The browser then calls
`startWithdraw(credential, { withdrawRequest, inIndex, finalizedTx })`. The server derives the
vault account, and in one database transaction stores the withdrawal in
`AwaitingStartTransaction` and commits the call as a Midnight transaction in
`AwaitingSubmission`. Completion is `prepareCompleteWithdraw(credential, { name })`, which
checks the state and answers with the attested request's `requestId`, `attestationOutputKind`
and `attestationOutput` (`WithdrawCompleteInputs`), the `completeWithdraw` call built from them
under a fresh mint nonce with a one-byte completion output, finalised by the wallet, and
`completeWithdraw(credential, { name, finalizedTx })`, which checks the state again and
commits the call in `AwaitingSubmission`. No withdraw method takes the wallet's keys: they go
into the calls the page builds and nowhere else. A state conflict is an `{ ok: false }` result
of `WithdrawServiceAdaptor`, and the six server actions in
`src/server/actions/withdraw-actions.ts` forward to it. `withdraw-v1/browser-withdraw-calls.ts`
(`startWithdrawInBrowser`, `completeWithdrawInBrowser`, `browserWithdrawCallBuilder`) runs the
sequence for the Send dialog and the Activity table's auto-completion, reporting each stage.

## ERC-20 vault supply API

`src/lib/midnight/ethereum-erc20-vault/supply-v1` is the resource-oriented API for supplying the
underlying of Aave's static wrapper, the Supply of the Lend tab. A supply is named
`callers/{caller}/ethereum-erc20-vault-supplies/{supply}` and runs the caller operation's six
states under its own names, as the withdrawal does: `AwaitingStartTransaction` while the
page-built `startSupply` call is paid for by the relayer and included, `AwaitingVaultRequest`
while the vault request behind it runs to `Attested` (the MPC signs the wrapper's
`deposit(amount, vaultAccount)` from the vault account), `AwaitingCompletion` for the user, or
the sweep once the ledger shows the request settled, `AwaitingCompleteTransaction` while the
page-built `completeSupply` call is paid for and included, then `Completed` with `outcome`
`supplied` or `refunded`, or `Failed` with `StartFailed`.

A supply holds the caller's request (`amount`), the pinned pair (`underlyingErc20Address`,
`stataErc20Address`), the slot `inIndex` the server assigns when the start is prepared, and
`vaultAccount`, which the server derives when the start is committed. The caller's two calls take
the same path as the withdrawal's (see [ERC-20 vault withdraw API](#erc-20-vault-withdraw-api)):
the browser calls `prepareStartSupply(credential, { supplyRequest })`, which reads the pair
from the vault ledger and answers with `{ inIndex, underlyingErc20Address }`
(`SupplyStartInputs` in `supply.ts`) and writes nothing, builds the `startSupply` call with the
vault secret as the witness and the connected wallet's keys (`SupplyCallBuilder`), proves it,
and has the wallet balance it with its own coins and DUST fee, sign and finalise it. The
circuit surrenders a fresh coin of the underlying's vault token worth exactly `amount`, whose
coin type the option builder derives from the underlying and the vault address, so this
balancing spends the wallet's own coins of that vault token and leaves the change. The browser
then calls `startSupply(credential, { supplyRequest, inIndex, finalizedTx })`. The server
reads the pair from the ledger again and derives the vault account, and in one database
transaction stores the supply in `AwaitingStartTransaction` and commits the call as a Midnight
transaction in `AwaitingSubmission`. Completion is `prepareCompleteSupply(credential, { name
})`, which checks the state and answers with the attested request's `requestId`,
`attestationOutputKind` and `attestationOutput` (`SupplyCompleteInputs`), the `completeSupply`
call built from them under a fresh mint nonce with a 32-byte completion output (the attested
shares, or zeros the circuit ignores), finalised by the wallet, and `completeSupply(credential,
{ name, finalizedTx })`, which checks the state again and commits the call in
`AwaitingSubmission`. No supply method takes the wallet's keys: they go into the calls the page
builds and nowhere else. A state conflict is an `{ ok: false }` result of `SupplyServiceAdaptor`,
and the seven server actions in `src/server/actions/supply-actions.ts` (the four above,
`getSupplyTarget`, `getSupply` and `listSupplies`) forward to it. `supply-v1/browser-supply-calls.ts` (`startSupplyInBrowser`,
`completeSupplyInBrowser`, `browserSupplyCallBuilder`) runs the sequence for the Lend tab and the
Activity table's auto-completion, reporting each stage.

## ERC-20 vault redeem API

`src/lib/midnight/ethereum-erc20-vault/redeem-v1` is the resource-oriented API for redeeming the
shares of Aave's static wrapper for its underlying, the Redeem of the Lend tab. A redeem is named
`callers/{caller}/ethereum-erc20-vault-redeems/{redeem}` and runs the caller operation's six
states under its own names, as the withdrawal does: `AwaitingStartTransaction` while the
page-built `startRedeem` call is paid for by the relayer and included, `AwaitingVaultRequest`
while the vault request behind it runs to `Attested`, `AwaitingCompletion` for the user, or the
sweep once the ledger shows the request settled, `AwaitingCompleteTransaction` while the
page-built `completeRedeem` call is paid for and included, then `Completed` with `outcome`
`redeemed` or `refunded`, or `Failed` with `StartFailed` (see
[Swaps and approvals](#swaps-and-approvals) for what each circuit does).

A redeem holds the caller's `shares`, the pinned pair (`stataErc20Address` and
`underlyingErc20Address`), the slot `inIndex` the server assigns when the start is prepared, and
`vaultAccount`. The browser calls `prepareStartRedeem(credential, { redeemRequest })`, which
reads the pair from the vault ledger and answers with `{ inIndex, stataErc20Address }`
(`RedeemStartInputs` in `redeem.ts`) and writes nothing, builds the `startRedeem` call with the
vault secret as the witness and the connected wallet's keys (`RedeemCallBuilder`, which derives
the surrendered coin's type from the wrapper and the vault address), proves it, and has the wallet balance it with its own coins and DUST fee, sign and finalise it,
spending the wallet's own coins of the wrapper's vault token and leaving the change. The browser
then calls `startRedeem(credential, { redeemRequest, inIndex, finalizedTx })`. The server
reads the pair from the ledger again, derives the vault account, and in one database transaction
stores the redeem in `AwaitingStartTransaction` and commits the call as a Midnight transaction
in `AwaitingSubmission`. Completion is `prepareCompleteRedeem(credential, { name })`, which
checks the state and answers with the attested request's `requestId`, `attestationOutputKind`
and `attestationOutput` (`RedeemCompleteInputs`), the `completeRedeem` call built from them
under a fresh mint nonce with a 32-byte completion output (the attested assets, or zeros the
circuit ignores), finalised by the wallet, and `completeRedeem(credential, { name, finalizedTx
})`, which checks the state again and commits the call in `AwaitingSubmission`. No redeem method
takes the wallet's keys. A state conflict is an `{ ok: false }` result of `RedeemServiceAdaptor`, and the six
server actions in `src/server/actions/redeem-actions.ts` forward to it.
`redeem-v1/browser-redeem-calls.ts` (`startRedeemInBrowser`, `completeRedeemInBrowser`,
`browserRedeemCallBuilder`) runs the sequence for the Lend tab and the Activity table's
auto-completion, reporting each stage, and a contract assert while building is thrown as the
vault refusing the redeem.

## ERC-20 vault swap API

`src/lib/midnight/ethereum-erc20-vault/swap-v1` is the resource-oriented API for selling one
vault token for another on the vault's pinned Uniswap router, the Swap panel of the home page. A
swap is named `callers/{caller}/ethereum-erc20-vault-swaps/{swap}` and runs the caller
operation's six states under its own names, as the withdrawal does: `AwaitingStartTransaction`
while the page-built `startSwap` call is paid for by the relayer and included,
`AwaitingVaultRequest` while the vault request behind it runs to `Attested` (the MPC signs the
router's `exactOutputSingle` from the vault account), `AwaitingCompletion` for the user, or the
sweep once the ledger shows the request settled, `AwaitingCompleteTransaction` while the
page-built `completeSwap` call is paid for and included, then `Completed` with `outcome`
`swapped` or `refunded`, or `Failed` with `StartFailed` (see
[Swaps and approvals](#swaps-and-approvals) for what each circuit does).

A swap holds the caller's request (`erc20AddressIn`, `erc20AddressOut`, `fee`, `amountOut`,
`amountInMaximum`), the slot `inIndex` the server assigns when the start is prepared, and
`vaultAccount`, which the server derives when the start is committed. The browser calls
`prepareStartSwap(credential, { swapRequest })`, which answers with `{ inIndex }`
(`SwapStartInputs` in `swap.ts`) and writes nothing, builds the `startSwap` call with the caller
secret as the witness and the connected wallet's keys (`SwapCallBuilder`, which derives the
surrendered coin's type from `erc20AddressIn` and the vault address), proves it, and has the
wallet balance it with its own coins and DUST fee, sign and finalise it, spending the wallet's
own coins of the sold token's vault token worth `amountInMaximum` and leaving the change. The
browser then calls `startSwap(credential, { swapRequest, inIndex, finalizedTx })`. The server
derives the vault account, and in one database transaction stores the swap in
`AwaitingStartTransaction` and commits the call as a Midnight transaction in
`AwaitingSubmission`. Completion is `prepareCompleteSwap(credential, { name })`, which checks
the state and answers with the attested request's `requestId`, `attestationOutputKind` and
`attestationOutput` (`SwapCompleteInputs`), the `completeSwap` call built from them under a
fresh mint nonce and a fresh change nonce with a 32-byte completion output (the attested
`amountIn`, or zeros the circuit ignores), finalised by the wallet, and
`completeSwap(credential, { name, finalizedTx })`, which checks the state again and commits
the call in `AwaitingSubmission`. No swap method takes the wallet's keys. A state conflict is an
`{ ok: false }` result of `SwapServiceAdaptor`, and the seven server actions in `src/server/actions/swap-actions.ts` (the
four above, `quoteSwap`, `getSwap` and `listSwaps`) forward to it.
`swap-v1/browser-swap-calls.ts` (`startSwapInBrowser`, `completeSwapInBrowser`,
`browserSwapCallBuilder`) runs the sequence for the Swap panel and the Activity table's
auto-completion, reporting each stage, and a contract assert while building is thrown as the
vault refusing the swap.

## ERC-20 vault approval API

`src/lib/midnight/ethereum-erc20-vault/approval-v1` is the resource-oriented API for the vault
account's grants to the contract's two spenders, which the admin page starts. An approval is
named `callers/{caller}/ethereum-erc20-vault-approvals/{approval}` and runs the caller
operation's six states under its own names, as the withdrawal does: `AwaitingStartTransaction`
while the page-built start call (`startApproveRouter` or `startApproveStata`, by the approval's
`kind`) is paid for by the relayer and included, `AwaitingVaultRequest` while the vault request
behind it runs to `Attested` (the MPC signs the ERC20's `approve(spender, 2^128 - 1)` from the
vault account), `AwaitingCompletion` for the deployer, or the sweep once the ledger shows the
request settled, `AwaitingCompleteTransaction` while the page-built `completeApprove` call is paid
for and included, then `Completed` with `outcome` `approved` or `closed`, or `Failed` with
`StartFailed` (see [Swaps and approvals](#swaps-and-approvals) for what each circuit does).

An approval holds its `kind` (`router` or `stata`), the ERC20 the allowance is granted on and
the `spender`, the slot `inIndex` the server assigns when the start is prepared, and
`vaultAccount`. The deployer's two calls take the same path as the withdrawal's (see
[ERC-20 vault withdraw API](#erc-20-vault-withdraw-api)): the browser calls
`prepareStartApproval(credential, { approvalRequest })`, which answers with `{ inIndex }`
(`ApprovalStartInputs` in `approval.ts`) and writes nothing, builds the kind's start call with
the vault secret as the witness and the connected wallet's keys (`ApprovalCallBuilder`), proves
it, and has the wallet balance it with its own DUST fee, sign and finalise it.
`startApproveRouter` takes the slot and the token the request names, and `startApproveStata`
takes the slot alone, since the contract reads the wrapper and its underlying from its own
ledger. Neither start takes a coin, so the balancing adds the fee alone. The contract refuses any
identity but the deployer's while the call is built, which the page reports as the vault
refusing the approval. The browser then calls `startApproval(credential, { approvalRequest,
inIndex, finalizedTx })`. The server reads the spender (and for a stata approval the
underlying) from the vault ledger, derives the vault account, and in one database transaction
stores the approval in `AwaitingStartTransaction` and commits the call as a Midnight transaction
in `AwaitingSubmission` under the kind's start circuit (`APPROVAL_START_CIRCUIT_BY_KIND`).
Completion is `prepareCompleteApproval(credential, { name })`, which checks the state and
answers with the attested request's `requestId`, `attestationOutputKind` and
`attestationOutput` (`ApprovalCompleteInputs`), the `completeApprove` call built from them with
a one-byte completion output (the attested approve result, or a zero byte the circuit ignores)
and no nonce, since the circuit mints nothing, finalised by the wallet, and
`completeApproval(credential, { name, finalizedTx })`, which checks the state again and
commits the call in `AwaitingSubmission`. No approval method takes the wallet's keys. A state
conflict is an `{ ok: false }` result of `ApprovalServiceAdaptor`, and
the seven server actions in `src/server/actions/approval-actions.ts` (the four above,
`listApprovalTargets`, `getApproval` and `listApprovals`) forward to it.
`approval-v1/browser-approval-calls.ts` (`startApprovalInBrowser`, `completeApprovalInBrowser`,
`browserApprovalCallBuilder`) runs the sequence for the admin page's spender list and the
Activity table's auto-completion, reporting each stage.

## Swaps and approvals

A deposit, a swap and an approval share one lifecycle: the caller's start call queues a vault
request, the request runs to `Attested` on its own, and the caller's complete call settles it.
`src/lib/midnight/ethereum-erc20-vault/caller-operation` holds that lifecycle once: the six
states and the `StartFailed` failure (`caller-operation.ts`), the transition table and the
field consistency check (`caller-operation-state-machine.ts`), the controller contract with its
events and conflict error (`caller-operation-state-controller.ts`), and the controller,
resolver and event consumer bases (`-impl.ts` and `caller-operation-event-consumer.ts`) that
take a `CallerOperationKind`: the vault action, the start and complete circuits, the events,
the conflict class, the signer account and the outcome the complete call's attested request
reads as. `deposit-v1`, `withdraw-v1`, `swap-v1`, `supply-v1`, `redeem-v1` and `approval-v1`
each keep their own resource, repository, service, adaptor, actions and fixtures, and their
controller, resolver and consumer are the bases bound to their kind. The vault request names
its `signerAccount`: the caller's deposit account for a deposit, the vault account for a
withdrawal, a swap, a supply, a redeem or an approval, whose nonce the flush assigns.

A withdrawal (`src/lib/midnight/ethereum-erc20-vault/withdraw-v1`, see
[ERC-20 vault withdraw API](#erc-20-vault-withdraw-api)) is the contract's ERC20 transfer out
of the vault, which the UI calls Send: `startWithdraw` burns a vault coin of the token worth
exactly `amount`, which the caller's wallet funds from its balance when it balances the call in
the page, `sendWithdraw` has the MPC sign `transfer(destEvmAddress, amount)` from the vault
account, and `completeWithdraw` closes the withdrawal after a transfer that returned true or
re-mints the surrendered amount to the caller after one the MPC attested as failed, unviable or
returning false (outcomes `sent` and `refunded`). The caller supplies the token, the amount and
the destination address, and nothing else: the destination is pasted, never connected.

A swap (`src/lib/midnight/ethereum-erc20-vault/swap-v1`, see
[ERC-20 vault swap API](#erc-20-vault-swap-api)) is the contract's exact-output trade on its
pinned Uniswap router: `startSwap` burns a vault coin of the sold token worth exactly
`amountInMaximum`, which the caller's wallet funds from its balance when it balances the call in
the page, and `completeSwap` mints the exact `amountOut` of the bought token plus the unspent
input as change, or re-mints the surrendered amount after a trade the MPC attested as failed or
unviable (outcomes `swapped` and `refunded`). `SwapService.quoteSwap` asks Uniswap's QuoterV2
(`UniswapQuoter`, `src/lib/ethereum/uniswap-quoter.ts`, over `EVM_UNISWAP_QUOTER_ADDRESS`) for
the exact-input price on every fee tier and answers with the tier that pays most, what it pays
and that less the slippage allowance, which a swap started from the quote asks for. The
allowance is the caller's `slippageBps`, ten percent (`SWAP_SLIPPAGE_BPS` in `swap-quote.ts`)
when unset and at most half the output (`SWAP_MAX_SLIPPAGE_BPS`). A pair no pool prices is a
result, not a failure. The router pulls the sold token from the vault account under the
allowance `startApproveRouter` grants, so the Swap panel reads the vault's approval targets
(`useApprovalTargets()` in `src/components/use-approval-targets.ts`, the list the admin page
shows, and `routerAllowanceOf()` beside the target schema) and keeps Swap disabled, naming the
admin page, while the router's allowance for the sold token is zero or unread: a trade started without it reverts on Ethereum and refunds.

A supply (`src/lib/midnight/ethereum-erc20-vault/supply-v1`) is the contract's deposit into
Aave's static wrapper, the pair the deployer pinned at initialisation (`stataUnderlying` and
`stataToken` on the ledger, see [ERC-20 vault supply API](#erc-20-vault-supply-api)):
`startSupply` burns a vault coin of the underlying worth exactly `amount`, which the caller's
wallet funds from its balance when it balances the call in the page,
`sendSupply` has the MPC sign the wrapper's `deposit(amount, vaultAccount)` from the vault
account, and `completeSupply` mints the shares the MPC attested (the wrapper's `uint256`
return, 32 bytes) as the wrapper's vault token to the caller, or re-mints the surrendered
underlying after a deposit the MPC attested as failed or unviable (outcomes `supplied` and
`refunded`). The wrapper pulls the underlying under the allowance `startApproveStata` grants,
so a supply without that approval executes a failing deposit and refunds.
`SupplyService.getSupplyTarget` reads the pair from the ledger and the wrapper's allowance from
the chain, which the Lend tab gates Supply on. The caller supplies the amount and nothing else.

A redeem (`src/lib/midnight/ethereum-erc20-vault/redeem-v1`) is the wrapper's redemption, the
supply's reverse (see [ERC-20 vault redeem API](#erc-20-vault-redeem-api)): `startRedeem` burns
a vault coin of the wrapper's token worth exactly `shares`, which the caller's wallet funds from
its balance when it balances the call in the page, `sendRedeem` has the MPC sign the wrapper's `redeem(shares, vaultAccount,
vaultAccount)` from the vault account, which burns the shares it holds and pays it the
underlying, and `completeRedeem` mints the underlying the MPC attested (the wrapper's
`uint256` return, 32 bytes) as the underlying's vault token to the caller, or re-mints the
surrendered shares after a redeem the MPC attested as failed or unviable (outcomes `redeemed`
and `refunded`). No allowance is involved. The caller supplies the shares and nothing else.

An approval (`src/lib/midnight/ethereum-erc20-vault/approval-v1`) is the vault account granting
one of the contract's two spenders an unlimited allowance: the Uniswap router on a token a swap
sells (`startApproveRouter`), or the Aave static wrapper on its underlying (`startApproveStata`).
Both starts and the complete are deployer-gated in the contract, which refuses any other
identity's secret when the page builds the call, so the server needs no gate of its own (see
[ERC-20 vault approval API](#erc-20-vault-approval-api)).
`ApprovalService.listApprovalTargets` reads the spenders from the vault ledger and each
allowance from the chain, for the admin page at `/admin` (`src/components/admin-page.tsx`):
behind the vault secret it lists every spender with its allowance and an Approve control
that builds, proves and finalises the start call in the page with a stage line above the list, and
the approvals it starts run through the same Activity table (`ActivitySection` with the
`Approval` type) with the same in-page completion as a deposit. The Settings
popover links to it.

## Activity view

`midnight_ethereum_erc20_vault_activity_v1` is a Postgres view over the lifecycle tables, one row
per vault activity, defined in `src/lib/db/schema.ts`. It has one
branch per caller operation, deposits, withdrawals, swaps, supplies, redeems and approvals,
joined with
`UNION ALL`. Each
operation is projected with the newest child of each kind under it: its start and complete
Midnight transactions (the approval's start may carry either approval circuit), its vault
request and that request's Ethereum transaction, each found by parent (and circuit) and ordered
by create time, so a retried step shows its latest attempt. The database aggregates the states:
`state` is `Complete` for a completed operation, `Failed` for a failed one and `Pending`
otherwise, and each transaction's `state` is `Succeeded`, `Failed` or `Pending` from its row's
state. The `CASE` arms are built from the constants in
`src/lib/midnight/ethereum-erc20-vault/activity-v1/activity.ts`, so each set has one definition,
and nothing above the repository derives a status.

A row carries the projected resource's own `name`, `type`, `state`, `erc20Address` and `amount`
(what the operation surrenders or moves: the deposited token, the sold token and its cap, the
approved token with a null amount), `erc20AddressOut` and `amountOut` (a swap's bought side),
`spender` (an approval's), `outcome`, `error`, `resourceState` (the operation's own state),
`vaultRequestState`, `vaultRequestId`, three nullable `{ hash, state }`
objects (`startTransaction`, `foreignChainTransaction`, `completeTransaction`, stored as `jsonb`
and parsed by the resource schema), `createTime` and `updateTime` (the newest update across the
joined rows). The resource is a discriminated union on `type`, so each type's row keeps its own
outcome set and its own sides.

The repository is the reading half of the repository contract: `ReadRepository` (`get` and
`search` without a lock) over `SQLReadRepository`, which selects from a table or a view and which
`SQLRepository` extends with `create`, `update` and locking. `ActivityService` lists a caller's
activities newest first by the caller prefix of their names, of the types asked for, and gets
one by name, its adaptor and the server actions in `src/server/actions/activity-actions.ts`
expose both, and nothing writes to the view.
`integration-tests/ethereum-erc20-vault-activity.test.ts` reads the projection and the
aggregation back from Postgres, and the end-to-end deposit asserts its row is `Complete` with all
three hashes.

### Driving a deposit from the Activity table

The browser keeps no flow state of its own: every step it offers is read from the activity row,
so a closed tab, a reload or a lost connection loses nothing and the next refresh offers the
same step again. The view projects, beside the aggregated state, the deposit's own state, the
newest vault request's state and each child transaction's own state as `lifecycleState`.
`activityActionOf()` and `activityStepsOf()`
(`src/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress.ts`) derive from those
the user's next step (`complete` or `none`) and the ten-step progress, each step carrying
`signedInPage` and the `reference` it leaves behind. `signedInPage` is true for every type's
start and completion calls, which the page builds, proves and signs with the wallet
unprompted, and false for every step the wallet takes no part in. The references are the start
and completion calls' Midnight transaction ids, the vault request's Sig Network request id
(projected by the view as `vaultRequestId`) and the sweep's Ethereum transaction hash, each
null until its step assigns it.

`ActivitySection` reads `listActivities` through React Query, every five seconds while a row
is pending and every thirty otherwise, and maps each row with `activityEntryOf()`
(`src/lib/activity/activity-entries.ts`). Beside its status badge every row has one icon button
into `ActivityFlowDialog` (`src/components/activity-flow-dialog.tsx`), an eye with the tooltip
"View details". The dialog says where the activity stands and keeps the ten steps behind a
"See more details" pane that opens closed, where a step signed in the page carries a wallet
with a bolt (`WalletSigningIcon`) and a step's reference shows abbreviated with its meaning in a tip, a copy button and a block
explorer link: an Ethereum transaction opens in the chain's explorer
(`ethereumExplorerOf()` in `src/lib/config/ethereum-explorer.ts`: Otterscan from `compose.yaml`
on the local stack, which `isLocalEnvironment()` recognises by its undeployed Midnight network
and loopback EVM node, Etherscan on Sepolia or mainnet), a Midnight transaction opens the block
that holds it in Polkadot.js Apps once the ledger has recorded it (`midnightExplorerOf()` in
`src/lib/config/midnight-explorer.ts`: the copy from `compose.yaml` on the local stack, the
public site over the configured node elsewhere), and a Sig Network request opens its lifecycle
in the sig.network explorer (`signetExplorerOf()` in `src/lib/config/signet-explorer.ts`: the
copy from `compose.yaml` on the local stack, <https://sig-net.github.io/explorer/> elsewhere,
the network named in the URL). The completion needs no click: the completion circuit proves the caller's
secret as its witness, and the browser is the one place that holds it, so `ActivitySection`
completes every activity the view shows in `AwaitingCompletion`, once per row per thirty
seconds (`activitiesDueForCompletion()` in `src/lib/activity/completions-due.ts`). A deposit
completes through `completeDepositInBrowser()`
(`src/lib/midnight/ethereum-erc20-vault/deposit-v1/browser-deposit-calls.ts`):
`prepareCompleteDeposit` answers the attested request's inputs, the page builds and proves the
`completeDeposit` call under a fresh mint nonce, the wallet finalises it with its own coins and
DUST fee (`Wallet.balanceUnsealedTransaction()`), and `completeDeposit` records it for the backend to submit. A withdrawal, a supply, a redeem, a swap and an approval complete the same way
through their own modules (`PAGE_COMPLETE_BY_TYPE` in `activity-section.tsx`). A refusal means
another tab got there first
and is left to the next window. Success and failure surface
as toasts from the shadcn `sonner` toaster mounted in the root layout, and the Next dev
server's server function invocation log is switched off in `next.config.ts`, since every action
carries the login credential as its first argument.

The same Ethereum explorer opens an account's page from an `EthereumAccountLink`
(`src/components/ethereum-account-link.tsx`) wherever the UI names one: the deposit account in
the vault secret popover and the Deposit dialog, and the deposit and vault accounts in the readiness
checklist, beside the faucet wand.

The deposit itself starts from the deposit dialog: each fund line's control runs
`startDepositInBrowser()` from the same module for the whole fund. `prepareStartDeposit`
assigns the slot, the nonce and the gas, the page builds and proves the `startDeposit` call with
the vault secret as its witness, the wallet finalises it with its own coins and DUST fee, and
`startDeposit` records the deposit and commits the call for the backend to submit. A start refused
because the deposit account's nonce moved runs once more from `prepareStartDeposit`, and no
other refusal is retried. The dialog names the running stage under the funds (preparing,
building and proving, paying and signing, recording), stays inert until the server answers, and closes on
success with a toast. A contract assert raised while the call is built is reported as the vault
refusing the deposit, with the assert's text. The dialog and `ActivitySection` import the
module dynamically, when a deposit starts or completes. The prover keys come from the page's own
origin under `/zk-assets/ethereum-erc20-vault`, and the proofs from the configured proof
server. From then on the Activity table is the only place the flow is driven from.

## Midnight wallet

`src/lib/midnight/wallet` holds the wallet layer. `MidnightWalletProvider` drives it, and the
wallet components read its types and the connection status label.

- `wallet.ts` defines the `Wallet` interface, `WALLET_KINDS` (only `seed` today),
  `WalletMetadata` and `WalletAddresses`, the three addresses a wallet publishes before it has
  synchronised. `Wallet` is a subset of the DApp connector API a browser wallet extension
  serves, and nothing more (see [The wallet interface](#the-wallet-interface)). A wallet signs
  a caller's call with `balanceUnsealedTransaction`, which balances it with the wallet's own
  coins and DUST fee, signs and finalises it for the backend to submit. The page finalises every
  operation's two caller calls this way (see [Midnight transactions](#midnight-transactions)),
  and logs the caller in with `signData` (see [Caller authentication](#caller-authentication)).
- `connection-status.ts` defines `WalletConnectionStatus`, the status label the wallet components
  show, and derives it from the provider's state.
- `seed-wallet.ts` is the seed implementation: it derives account-zero keys from a hex seed,
  publishes the shielded, unshielded and DUST addresses immediately, starts the wallet SDK facade
  against the configured Midnight endpoints, reports synchronisation progress, and clears the
  seed and keys on disconnect. `seed-wallet-facade.ts` holds the key derivation, the facade
  construction and the transaction provider it builds on.
- `MidnightWalletProvider` (`src/components/contexts/MidnightWalletContext.tsx`) owns one wallet
  at a time. It reads the Midnight network from `useConfig()`, so it renders inside
  `ConfigProvider`, which is why `AppBar` sits in the `(configured)` layout. Each disconnect
  advances a generation, published on the context as `generation`: a superseded connection's
  results are dropped, its wallet is disconnected exactly once, and a query keyed on the
  generation never outlives the wallet it read. The SDK loads on the first connection through a
  dynamic import.
  The connected seed is written to local storage (`src/lib/midnight/wallet/seed-storage.ts`, a
  slot from `src/lib/local-storage-slot.ts`) and restored on the next load, so a refresh
  reconnects the same wallet. While a seed is stored, no other seed can connect: disconnecting
  clears the store, and so does a failed connection. This keeps a wallet secret in a persistent
  store on purpose, as a convenience for a demo, and the vault secret is kept the same way.
- `WalletPanel` (`src/components/wallet-panel.tsx`) renders the wallet for both layouts: the
  connection status, the addresses once known, the seed dialog and disconnect. From the `md`
  breakpoint up, `WalletPopover` shows it from the app bar button that carries the status dot.
  Below it, the `MobileMenu` sheet shows it under a collapsible Wallet item.
  Under the addresses of a connected wallet, past a rule, the panel lists the wallet's NIGHT and
  DUST (`useNativeBalances()` in `src/components/use-native-balances.ts` over
  `readNativeBalances()` in `src/lib/midnight/wallet/native-balances.ts`: the unshielded balance
  under the ledger's native token type and the spendable DUST now), read every ten seconds. The
  NIGHT line carries two controls. On the local stack a wand (`LocalNightFaucetButton`,
  `src/components/local-night-faucet-button.tsx`) sends the wallet NIGHT from the
  [local NIGHT faucet](#vault-readiness). For the seed wallet, the one wallet that registers
  NIGHT in the page, a tick (`RegisterNightButton`, `src/components/register-night-button.tsx`)
  reads the NIGHT not yet registered for DUST generation (`SeedWallet.getUnregisteredNightBalance()`,
  under the same query key as the balances, so the wand's invalidation reaches it) and registers
  it through `SeedWallet.registerNightForDust()`, both reached by narrowing the connected wallet
  with `isSeedWallet()` (`src/lib/midnight/wallet/is-seed-wallet.ts`) since neither is on
  `Wallet`. The registration runs over `registerNightForDust()` in
  `src/lib/midnight/wallet/register-night-for-dust.ts`: the unregistered coins are registered in
  one transaction, signed with the unshielded keystore, after the SDK has waited for those coins'
  projected DUST to cover the registration's own fee. Once every coin is registered the tick
  turns into a mark, and without NIGHT there is no tick. Both controls read the balances and the
  readiness again when they are done.

### The wallet interface

The application runs on a chain version the browser wallet extensions do not support yet, and
it moves to them the moment they do. `Wallet` is therefore a subset of what an extension serves
through the DApp connector API, `WalletConnectedAPI` in `@midnight-ntwrk/dapp-connector-api`
(4.0.1, a type-only dev dependency), and nothing more: a member the connector cannot serve would
be lost in the move. The guard is the type check. `src/lib/midnight/wallet/wallet.test.ts`
asserts with vitest's `expectTypeOf` that every member of `Wallet` is either one of the connector
methods in `WalletConnectorMethods`, held equal to the connector's own declaration, or one of
the page-owned reads listed there with the connector read it comes from, so `yarn typecheck`
fails on any other member and on any drift from the connector's signatures.

| `Wallet` member                | Connector source                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `getShieldedBalances()`        | The same method.                                                                                    |
| `getUnshieldedBalances()`      | The same method.                                                                                    |
| `getDustBalance()`             | The same method: `{ cap, balance }` in SPECK.                                                       |
| `balanceUnsealedTransaction()` | The same method: the unbound bytes of a proven call in hex in, the finalised bytes in hex out.      |
| `signData()`                   | The same method: the MIP-0031 signed message of the payload, signed with the unshielded key.        |
| `addresses`                    | `getShieldedAddresses()`, `getUnshieldedAddress()` and `getDustAddress()`, read once at connection. |
| `publicKeys`                   | The coin and encryption public keys of `getShieldedAddresses()`, decoded from Bech32m to hex.       |
| `kind`, `name`                 | The application's own wallet kind, and `InitialAPI.name`.                                           |
| `disconnect()`                 | The page's own teardown, since the extension owns the connection.                                   |

What the connector cannot serve stays off the interface, and the page lives without it:

- No release of finalised bytes the server refuses: the wallet keeps their coins pending until
  it frees them by its own rules.
- No pending balance: the panel shows the unshielded NIGHT the wallet reports and nothing of the
  coins an in-flight transaction spends.
- No NIGHT registration and no unregistered NIGHT read: a browser wallet registers NIGHT in its
  own interface. `SeedWallet` alone offers `registerNightForDust()` and
  `getUnregisteredNightBalance()`, outside `Wallet`, and `RegisterNightButton` reaches them by
  narrowing with `isSeedWallet()`.
- No synchronous key or provider access: the midnight-js `WalletProvider` and
  `MidnightProvider` slots are the relayer wallet's (`RelayerWallet.provider()`), never the
  page's.

Adding a connector method to `Wallet` means declaring it in `WalletConnectorMethods` as the
connector declares it and naming it in the pinned set in `wallet.test.ts`. Adding anything else
means naming the connector read it comes from in that test's `PageOwnedMember`, and a member
with no such read does not belong on `Wallet`.

One shim exists for the wallet SDK in the browser: `src/lib/midnight/buffer-shim.ts` installs a
global `Buffer` and binds `fetch` before the SDK modules load.

`package.json` pins `@midnightntwrk/ledger-v9` through `resolutions`, so the wallet SDK and the
contract packages share one ledger runtime.

## Home page

The home page shows three sections, each owned by one file that reads the data and passes typed
props down, so the presentation never changes when a data source does. The balance list and the
activity table render every entry at full height and leave scrolling to `HomeLayout`, described
under Styling and theme.

- `AppBar` (`src/components/app-bar.tsx`) is the header: the brand, the total balance, the
  Settings, identity and wallet popovers, and `GitHubCorner` (`src/components/github-corner.tsx`)
  folded over its top-left corner from the `md` breakpoint up, a link to the source repository
  drawn with the github-corners artwork (Tim Holman, MIT licence), whose Octocat waves its arm on
  hover unless the user prefers reduced motion. Its two colours (the brand logo's, brown in light mode and
  white in dark mode, and the background) and keyframes live at the end of
  `src/app/globals.css` as the one artwork exception to the shared presentation contract.

- `BalancesSection` (`src/components/balances-section.tsx`) reads the connected Midnight wallet's
  shielded balances through a React Query query, refetched every ten seconds and keyed on the
  network and the wallet connection generation, so a reconnected wallet never shows a replaced
  wallet's numbers. The query function is `readMidnightBalanceAmounts()`
  (`src/lib/balances/midnight-balances.ts`), ordered by token type. A token the registry knows
  (see Token information below) shows its symbol, its amount in whole tokens and the chain it
  came from. A token it does not know shows the first four characters of its token type as the
  symbol, its amount in base units written in full and Midnight as its network. The section
  values each balance at its token's spot price through `pricedBalance()` and the page's price
  table (see Spot prices below), and a balance without a price shows no value, never a zero.
  Without a wallet the section says so, and a failed read shows the error instead of a zero. Each entry renders a `BalanceBox`: the amount, its US dollar
  value, the `TokenIcon` and the Swap and Send buttons. The Deposit button is disabled until a
  Midnight wallet is connected and the vault secret is set, and while disabled a popover on
  hover, tap or focus names what is missing with the icon of its app bar control
  (`missingDepositPrerequisites()` in `src/lib/deposit-prerequisites.ts`). Once enabled, Deposit
  opens `DepositDialog` (`src/components/deposit-dialog.tsx`) on the caller's deposit account: the
  checksummed address as a QR code (`QrCode`, `src/components/qr-code.tsx`, round modules over the
  grid `src/lib/qr-modules.ts` encodes at error correction level H, with the Ethereum glyph over
  the centre) and as a copyable abbreviated address. The QR panel keeps the design's light
  palette and gradient in both themes, since a code scans dark on light. Below it the dialog
  scans the deposit account once as it opens, through the `listDepositAccountFunds` action, and
  again only from its Check again control: it reports how many supported tokens the account holds
  above zero and lists each as its icon, its symbol and its amount in whole tokens; the vault
  admits more than one contract called USDC, so a symbol another fund shares is qualified by its
  issuer. The Deposit control on each line starts the deposit of the whole fund (see Driving a
  deposit from the Activity table under Activity view). Send on a balance the vault admits opens
  `SendDialog` (`src/components/send-dialog.tsx`) on that token: the amount beside a token select
  over the wallet's supported balances, with the balance and a MAX control under it, then a
  pasted Ethereum address, which the dialog checks as one is typed, and a Send control gated on
  the vault secret, the wallet, an amount within the balance, a valid address and the
  withdraw readiness checks. Starting a send prepares, builds, proves and finalises the
  `startWithdraw` call in the page with the wallet's coin of the token, reporting each stage
  under the controls, records it for the backend to submit, and hands the rest to the
  Activity table, where the withdrawal is listed as a Send and completed in the page as a
  deposit is. Send is disabled on a balance the vault does not admit and while
  the vault secret is unset.
- `ActivitySection` (`src/components/activity-section.tsx`) reads the caller's activity through
  `listActivities` and renders `ActivityTable`. Each entry is a collapsible table body: from the
  `md` breakpoint up every column shows, below it a chevron expands the timestamp and block
  explorer details. The Status cell holds the badge, or the Balance button while a call waits
  for the wallet, and the progress info. The entry types live in `src/lib/activity/activity-entry.ts` and
  the mapping from the resource in `src/lib/activity/activity-entries.ts`. A deposit's destination
  is the shielded wallet it mints to, its `recipient`: the row shows the first six and last four
  characters of the address's data (`abbreviateAddressData()` in
  `src/lib/midnight/abbreviate-address.ts`) beside the wallet icon, with the full address as the
  hover title, and reads "your wallet" for a deposit stored without one.
- `HomeSections` (`src/components/home-sections.tsx`) owns what the balances and the swap panel
  share: a balance's Swap button asks for its token, which the swap panel selects as the From
  token and moves focus to the amount, until the user picks another token.
- `SidePanel` (`src/components/side-panel.tsx`) is the right column: two line blocks, Swap and
  Lend, over the shadcn tabs primitive styled as the design draws them, the open one filled. A
  balance's Swap button also opens the Swap tab. `LendPanel` (`src/components/lend-panel.tsx`)
  behind Lend is the vault's Aave leg. Supply reads the pinned pair and the wrapper's allowance
  through `getSupplyTarget` (refreshed at the sweep's pace), fixes the field's token to the
  underlying with the wallet's balance of it and a MAX control, and gates its control on the
  vault secret, the wallet, a non-zero allowance (the admin page grants it), an amount within
  the balance and the supply readiness checks. Starting a supply prepares, builds, proves and
  finalises the `startSupply` call in the page with the wallet's coin of the underlying, reporting
  each stage in a status line, and the toast says the backend is submitting the start call. The rest belongs to the Activity table, where the supply is listed as a Supply
  whose destination is the wrapper and completed in the page as a deposit is. Redeem reads the same
  pair, fixes its field to the wrapper's token with the wallet's balance of it (matched by token
  type, since the wrapper is outside the allowlist) and a MAX control, needs no allowance, and
  gates its control on the redeem readiness checks. Starting a redeem prepares, builds, proves
  and finalises the `startRedeem` call in the page with the wallet's coin of the shares, reporting
  each stage under the control, records it for the backend to submit, and hands the
  rest to the Activity table, where it is listed as a Redeem whose destination is the
  underlying and completed in the page as a deposit is.
- `SwapPanel` (`src/components/swap-panel.tsx`) sells a vault token the wallet holds for
  another the vault admits. The From field offers the wallet's supported balances
  (`useMidnightBalances`, `src/components/use-midnight-balances.ts`, the query the Balances
  section reads too, narrowed by `supportedBalancesOf()` in
  `src/lib/balances/supported-balances.ts`) and the To field every other supported token, each
  option with its `TokenIcon`. Under the From amount the field (`TokenAmountField`,
  `src/components/token-amount-field.tsx`, which the Send dialog and the Lend tab share) shows
  the typed amount's value at spot (`usdEstimate`, blank while the token is unpriced), the
  balance of the chosen token and a MAX control that spends it whole. An Advanced pane under the Swap button opens closed and holds the
  slippage allowance as a percentage, 10 unless changed, with a tip saying what it is for: the
  quote is asked again whenever it changes. The From amount rests for
  400 ms, then `quoteSwap` prices it and the To field shows the least the swap accepts; Swap
  prepares, builds, proves and finalises the `startSwap` call in the page with the From amount as
  the cap, that minimum as the exact output and the wallet's coin of the sold token, reporting
  each stage above the Swap button, records it for the backend to submit, and
  hands the rest to the Activity table, where it is completed in the page as a deposit is (see
  [ERC-20 vault swap API](#erc-20-vault-swap-api)).

`AssetAmount` (`src/lib/asset-amount.ts`) is the one shape for an amount of an asset on a network,
shared by the balances and the activity entries: the symbol, the network the asset came from,
the exact amount and value as strings, and an `IconSource` (`src/lib/icon-source.ts`) for the
asset and for the network. `TokenIcon` (`src/components/token-icon.tsx`) renders the pair as a
28px avatar with a 12px network badge over its bottom right corner, or at its `sm` size as 20px
with an 8px badge for a select option: an `image` source is a file
under `public` served by its URL path, a `web3icons` source loads that icon from
`@web3icons/react/dynamic` by its lookup name (a token symbol or a network id), and `none`
renders the lucide coin glyph with an empty badge.

The BTC, ETH and SOL artwork the design draws is bundled rather than fetched: `public/token-icons`
holds the `btc`, `eth` and `SOL` components of `Product UI.fig` as SVG, and `public/network-icons`
the 12px `BitcoinBadge`, `eth` and `SOL` badge instances with their own rounded border, so the
badge frame draws none around a bundled image. `src/lib/tokens/bundled-icons.ts` names them by
symbol and by network, and the dummy activity uses those entries.

### Token information

A Midnight balance is keyed by a 64-character token type, which says nothing about what the
token is. `src/lib/tokens` holds what the UI needs to render one:

- `token-id.ts`: `TokenId`, the ledger plus the raw token type. The ledger gives the shielded and
  the unshielded native token the same raw hex, so the raw type alone is ambiguous.
- `token-info.ts`: `TokenInfo`, the symbol, name, display decimals, icon source and origin of a
  token, and `ORIGIN_NETWORKS`, the badge network of each origin kind (an ERC20 vault token came
  from Ethereum).
- `token-info-registry.ts`: `TokenInfoRegistry`, a lookup by `TokenId` built from a list of
  `TokenInfo`. An unknown token answers undefined, and the balances fall back as described above.
- `format-token-amount.ts`: `formatTokenAmount()`, base units to an exact decimal in whole tokens.

The vault itself decides which ERC20s it accepts: its `allowedTokens` ledger set, grown only by
the deployer. `SupportedTokenService` (`src/lib/midnight/ethereum-erc20-vault/supported-token-v1`)
reads that set from the indexer and each token's `symbol()`, `name()` and `decimals()` from the
token contract through the `Erc20Reader` port (`erc20-reader.ts`, implemented over ethers in
`erc20-reader-ethers-impl.ts`), and the `listSupportedTokens` action in
`src/server/actions/supported-token-actions.ts` hands the list to the browser; the allowlist is
public vault state, so that one action takes no credential. The same service's
`listDepositAccountFunds` reads what the caller's deposit account holds of those tokens.

`vaultTokenInfos()` (`src/lib/midnight/ethereum-erc20-vault/vault-token-infos.ts`) turns the
allowlist into registry entries: for each ERC20 it derives the shielded token type the configured
vault mints, with `vaultTokenType()` over the vault's own domain-separator circuit, and marks the
entry supported. A bundled table augments the entries of the tokens it lists (Circle USDC and
EURC, WETH9, Chainlink LINK, Aave's test USDC and its static wrapper) with artwork, a display name,
an issuer and how it is priced (`pricing`, a `PriceRequest`: the CoinGecko coin id, or for the
wrapper the ERC-4626 share over its underlying's id); a supported token the table omits renders
with the metadata its contract reports, no artwork and no price, and a table entry the allowlist
omits stays in the registry unsupported. A
supported token's decimals are its contract's own, since the vault mints the ERC20's base-unit
amount one to one. The table's addresses are Sepolia's, and the local chain is a Sepolia fork, so
it serves chain 11155111 and chain 31337 and no other.

`TokenInfoRegistryProvider` (`src/components/contexts/TokenInfoRegistryContext.tsx`) fetches the
allowlist once per page load through React Query and builds the registry from it and the config,
holding the bundled table alone, nothing marked supported, until the list answers. The registry
answers `get()` by token identity, `byErc20Address()` for the fund scan, and `supported()`; its
`fingerprint` is part of the balances query key, so balances refetch when support arrives.
Valuation is the planned next source: a price port behind a React Query hook in the same context
file, which is why `usdValue` is a string the UI already renders.

### Vault readiness

An action costs its payers fees before it can start, and four payers are involved. The caller's
Midnight wallet pays the DUST of the two caller transactions the page builds and it finalises.
The relayer wallet pays the DUST of every queue flush, send and attestation. The caller's deposit
account pays the Ethereum gas of its sweep, since the MPC signs the sweep from that account. The
vault account (`vaultAccountOf()` in `src/lib/midnight/ethereum-erc20-vault/vault-account.ts`,
the SDK's `deriveVaultEvmAddress`) pays the gas of withdrawals, approvals, swaps, supplies and
redemptions, which the MPC signs from the vault's own account.

`src/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness.ts` defines one
`ReadinessCheck` per balance read: `ok` or `insufficient` with the balance and the requirement, or
`unavailable` with the reason a read failed, never a zero. `missingReadiness(action, checks)` is
the pure rule a gate asks: the checks a deposit or a vault-signed kind needs that do not pass, in
display order (every action needs the caller's DUST, the relayer's DUST and the paying
account's ETH). The requirements are the sweep's gas budget (`gasBudget(SWEEP_GAS)` in
`sweep-gas.ts`, gas limit times fee ceiling, 0.003 ETH), the costliest vault-signed envelope
read from the ledger (`vaultGasEnvelope()` over every kind, so one check serves them all), and
two pinned DUST minimums, `CALLER_DUST_MINIMUM` (1 DUST) and `RELAYER_DUST_MINIMUM` (5 DUST).
The prep repository prices each transaction with the wallet facade as it is built, so no
estimate exists before a transaction does. The minimums leave several times the local chain's
per-transaction overhead and are the values to recalibrate once a fee log says otherwise.

`ReadinessService.getVaultReadiness(caller, {})` (`readiness-service.ts`, implemented in
`readiness-service-impl.ts`) reads the three checks the backend can see: the relayer's DUST
through `RelayerWallet.dustBalance()`, and both ETH balances through the `EthereumAccountReader`
port (`src/lib/ethereum/account-reader.ts`, ethers in `account-reader-ethers-impl.ts`). The
`getVaultReadiness` action in `src/server/actions/readiness-actions.ts` hands them to the
browser. The caller's own DUST is read in the browser from the connected wallet, the only place
it exists.

`VaultReadinessProvider` (`src/components/contexts/VaultReadinessContext.tsx`) owns both reads
through React Query and exposes `checks`, `checking` and `recheck()`. Each read runs once its
input exists (a connected wallet, a set vault secret) and again only on `recheck()`, since
every read is a chain or wallet round trip, and a check whose read cannot run yet is unavailable
with the reason. `ReadinessChecklist` and `ReadinessRecheckButton` (`src/components/`) render the
lines and the control. The deposit dialog rechecks as it opens, reports "Ready to deposit" or
"Not ready to deposit" with the failing lines under it, and keeps each fund's deposit control
disabled while a check fails. The Settings popover shows every check as the vault's health.
`integration-tests/ethereum-erc20-vault-readiness.test.ts` reads the checks over the local stack
and funds a deposit account to flip its check.

A failing check is red, listed as a bullet under the heading, and on the local stack an ETH line
carries a wand that funds the account with one ETH and rechecks. The wand is the local faucet:
`LocalEthereumFaucetService.fundAccount({ account, amount })` (`src/lib/ethereum/local-faucet-v1`, over anvil's
`anvil_setBalance` in `local-ethereum-faucet-service-anvil-impl.ts`) behind the `fundAccount` action in
`src/server/actions/local-ethereum-faucet-actions.ts`. The backend builds the service only where
`isLocalEnvironment()` (`src/lib/config/local-environment.ts`) holds, an undeployed Midnight
network with the EVM RPC on a loopback host, since the fork reports Sepolia's chain id; anywhere
else the adaptor is built without a service and refuses every call, and the browser, reading the
same public configuration, renders no wand. The same faucet's `fundErc20({ account,
erc20Address, amount })` gives an account any ERC20 by writing its balance slot through
`anvil_setStorageAt`: the slot is found by writing a sentinel at the location each of the first
64 mapping slots implies, in the Solidity and the Vyper layouts, reading `balanceOf` back and
restoring the word, and a token whose balance lives elsewhere is refused with that reason. Both
calls then mine two blocks with `anvil_mine`, which moves the write into anvil's finalised state,
and return the balance read at the finalised block, so the recheck that follows sees it. The
deposit dialog's funds line carries a second wand on the local stack that opens a popover with
the vault's supported tokens and an amount in whole tokens (100 by default), parsed by
`parseTokenAmount()` (`src/lib/tokens/parse-token-amount.ts`), which refuses more decimals than
the token has. `integration-tests/ethereum-local-faucet.test.ts` funds a fresh account with ETH
and with USDC through the faucet, and the end-to-end deposit test funds its deposit account the
same way.
The admin page carries the same faucet as a form (`LocalEthereumFaucetPanel`,
`src/components/local-ethereum-faucet-panel.tsx`): any account, starting on the caller's deposit
account, ETH or any token the vault admits, and any amount, behind a wand. ETH funding takes an
optional `amount` in wei, one ETH when unset. The panel renders on the local stack only.

NIGHT lives on the Midnight chain, where no balance slot can be written, so the local NIGHT
faucet is a real transfer: `LocalMidnightFaucetService.fundNight({ unshieldedAddress, amount })`
(`src/lib/midnight/local-faucet-v1`) sends the amount in STAR, one million NIGHT when unset,
from the undeployed network's genesis mint wallet, whose seed is the public
`GENESIS_MINT_WALLET_SEED`. `LocalMidnightFaucetServiceSeedImpl` derives that wallet's keys as
the seed wallet does, starts and syncs its facade on the first funding and keeps it for the
process, runs one funding at a time since two transfers built from one state would reserve the
same coins, registers the wallet's NIGHT for DUST when its spendable DUST is below one, and
then runs `transferNight()` (`src/lib/midnight/wallet/transfer-night.ts`): one unshielded
output under the native token type, balanced in DUST only, signed with the unshielded keystore,
proved and submitted, with the reserved coins released when a step before the submission fails.
The result carries the transaction's identifier, and the receiving wallet shows the NIGHT once
its own sync reaches the block. The `fundNight` action in
`src/server/actions/local-midnight-faucet-actions.ts` reaches the adaptor, which is built
without a service outside the local stack and refuses every call there, exactly like the
Ethereum faucet's. `integration-tests/midnight-local-faucet.test.ts` funds a fresh wallet and
syncs it until the NIGHT shows. A transfer the node refuses reaches the wand with the node's
reason, since the facade module unwraps the SDK's fibre failure to the error it carries, and
`explainDustSpendRejection()` (`src/lib/midnight/wallet/dust-spend-rejection.ts`) adds what
the node's error 170 means: it could not verify the DUST spend proof against its own DUST
state, and a wallet synced moments before the build that still gets it needs the local
Midnight stack reset and redeployed.

## Spot prices

Every US dollar figure on the page is a spot valuation: the balance boxes, both sides of an
Activity row (valued at today's price, whenever the activity ran), the estimate under an amount
field and the total in the app bar. `src/lib/pricing` holds the domain. A `PriceRequest`
(`spot-price.ts`) says what to value: a `coin` by its CoinGecko id, or an `erc4626Share` of a
wrapper, worth its underlying's quote times what the wrapper pays out for one share
(`Erc4626Reader`, `src/lib/ethereum/erc4626-reader.ts`, over `decimals()`, `asset()` and
`convertToAssets()`). A `SpotPrice` answers one request with `usd` scaled by `10^8`, and every
value is computed in integers (`usdValueOf()`) and written to the cent (`formatUsd()`) at the
edge. The bundled token table assigns each token its request, so a test token on Sepolia or the
local fork is valued as the mainnet asset it stands for.

`SpotPriceSourceCoinGeckoImpl` reads CoinGecko's keyless public API, one `simple/price` request
for every id at once and no retry. That API's per-IP pool is shared and dynamic (about 10 to 30
calls a minute) and its terms exclude scheduled polling, so nothing but the server's cache may
call it. `SpotPriceServiceImpl` is that cache: a read serves what it holds, refreshes only the
entries older than ten minutes (`PRICE_TTL_MS`) in one source request shared by every read
waiting on it (the `CoalescingRunner`), records a coin the market does not quote so it is not
asked again before its TTL, and on a failed refresh keeps the old entries, waits thirty seconds
before trying the source again (`REFRESH_RETRY_DELAY_MS`) and withholds an entry an hour after
it was fetched (`PRICE_STALE_CEILING_MS`). The bound is therefore six source requests an hour
per server process, whatever the number of tabs or users. The adaptor parses up to fifty
requests per call, and `listSpotPrices` is the one action.

The browser reads the table through `useSpotPrices()` (`src/components/use-spot-prices.ts`),
one query over every token the registry values, kept for ten minutes. Until it answers, and
while it fails, the table is empty: a `usdValue` is then null, a balance box and an Activity row
show no figure, the amount field's estimate is blank and the total counts the balance as
unpriced beside the sum rather than as zero. A CoinGecko Demo key is not used; the public pool
suffices at the cache's rate.

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
