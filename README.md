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

| Script                  | Purpose                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `yarn dev`              | Start the development server.                                                                        |
| `yarn build`            | Create a production build.                                                                           |
| `yarn start`            | Serve the production build.                                                                          |
| `yarn typecheck`        | Generate the Next.js route types, then type check with `tsc`.                                        |
| `yarn lint`             | Lint with oxlint, including its type-aware rules.                                                    |
| `yarn format`           | Format with oxfmt.                                                                                   |
| `yarn format:check`     | Report files that are not formatted.                                                                 |
| `yarn test`             | Run the unit tests once.                                                                             |
| `yarn test:integration` | Run the integration tests against the local services.                                                |
| `yarn boundaries`       | Fail on a runtime import that crosses the backend boundary.                                          |
| `yarn check`            | Run the type check, the linter, the format check, the boundary check and the unit tests in sequence. |
| `yarn db:generate`      | Write a SQL migration for the changes made to the schema.                                            |
| `yarn db:migrate`       | Apply the migrations that the database has not yet run.                                              |

## Layout

| Path                                    | Contents                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/app`                               | App Router files: the root layout, `error`, `global-error`, `not-found`, `icon.svg`, global CSS.                 |
| `src/app/(configured)`                  | Routes that render inside `ConfigProvider`, gated by its layout: `/` and `/design`.                              |
| `src/components`                        | Application React components.                                                                                    |
| `src/components/ui`                     | Components written by the shadcn CLI.                                                                            |
| `src/components/contexts`               | React contexts: each file holds a context, its provider and its `use<Name>` hook.                                |
| `src/lib`                               | Non-React modules.                                                                                               |
| `src/lib/config`                        | Server configuration loading and the client configuration type.                                                  |
| `src/lib/db`                            | The Drizzle schema and the Postgres connection pool.                                                             |
| `src/lib/kafka`                         | The Kafka producer and consumer factories and the connection options.                                            |
| `src/lib/event`                         | The event layer: events, the outbox and Kafka publishers, the consumer hub and the outbox relay.                 |
| `src/lib/repository`                    | The repository contract every resource's storage implements, and its Postgres base class and an in-memory one.   |
| `src/lib/testing`                       | Test helpers: the `mock()` double for any interface.                                                             |
| `src/lib/ethereum/transaction-v1`       | The Ethereum transaction resource and its repository.                                                            |
| `src/lib/midnight/ethereum-erc20-vault` | The ERC-20 vault API modules, one folder per API version: resource schema, repository and service.               |
| `src/lib/midnight/transaction-v1`       | The Midnight transaction resource, its repository, state machine, state controller, resolver and event consumer. |
| `src/server`                            | The code that runs: the composition root, the server action files and the start-up.                              |
| `src/instrumentation.ts`                | Runs once when the server process starts and calls the start-up in `src/server/start.ts`.                        |
| `drizzle`                               | SQL migrations and their snapshots, written by `yarn db:generate`.                                               |
| `public/icons`                          | The sig.network wordmark and swan, in brown (light theme) and white (dark theme) variants.                       |

Pages and layouts are server components. A component opts into the browser with `'use client'`
only when it needs state, effects or browser APIs, as `src/components/mode-toggle.tsx` does.

## Configuration

Configuration is read from environment variables on the server at request time. Nothing is baked
in at build time, so one build serves every environment. `.env.example` lists the variables:

| Variable                                         | Secret | Purpose                                                                                                                                                             |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIDNIGHT_NETWORK_ID`                            | No     | `undeployed` or `stagenet`. Selects the default Midnight endpoints and the published contract values.                                                               |
| `MIDNIGHT_INDEXER_URL`                           | No     | Optional override of the indexer GraphQL endpoint.                                                                                                                  |
| `MIDNIGHT_INDEXER_WS_URL`                        | No     | Optional override of the indexer subscription endpoint.                                                                                                             |
| `MIDNIGHT_NODE_URL`                              | No     | Optional override of the node RPC endpoint.                                                                                                                         |
| `MIDNIGHT_PROOF_SERVER_URL`                      | No     | Optional override of the proof server, `http://127.0.0.1:6300` by default.                                                                                          |
| `MIDNIGHT_SIGNET_CONTRACT_ADDRESS`               | No     | 32-byte hex. Overrides the SDK's published signet singleton address, required for `undeployed`.                                                                     |
| `MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY`            | No     | secp256k1 key in SEC1 hex or `secp256k1:base58`. Overrides the published MPC root key, required for `undeployed`.                                                   |
| `MIDNIGHT_ETHEREUM_ERC20_VAULT_CONTRACT_ADDRESS` | No     | 32-byte hex. Overrides the published ERC20 vault address, required for `undeployed`.                                                                                |
| `EVM_CHAIN_ID`                                   | No     | Ethereum chain ID. `1`, `11155111` and `31337` have a default RPC.                                                                                                  |
| `EVM_RPC_URL`                                    | No     | Optional override of the RPC endpoint, required for other chains.                                                                                                   |
| `DB_CONNECTION_STRING`                           | Yes    | Postgres connection string. The value in `.env.example` points at the [local database](#local-services).                                                            |
| `KAFKA_BROKERS`                                  | No     | Kafka bootstrap brokers as comma-separated `host:port`. Server-only: it is not part of the client configuration.                                                    |
| `MIDNIGHT_ZK_ASSETS_ROOT`                        | No     | The root the backend's proof provider searches for every contract's prover keys and ZKIR, `zk-assets/` by default (see [Proving keys](#proving-keys)). Server-only. |

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
creates, updates or starts something, a consumer's `handleEvent`, an outbox batch) wraps its call
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
optional order, limit and a `lock` of `update-skip-locked` for work that claims rows inside a
transaction. A resource's repository file is a type alias of that interface, and its SQL
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
connection options and the `createProducer()` and `createConsumer()` factories; the composition
root builds the one producer of the server process, and a consumer is owned and closed by the
loop that asked for it. Keys, values and headers are strings.

Consumers run inside the Next.js server process. `src/instrumentation.ts` calls
`startBackend()` in `src/server/start.ts` from `register()`, which Next.js calls once when the
process starts. Every replica of the application joins the same consumer group, and Kafka divides
the topic's partitions among them.

## Testing

Unit tests run with [vitest](https://vitest.dev): `yarn test` runs every `src/**/*.test.ts`
once, and `yarn check` includes it. Integration tests live under `integration-tests/` and run
with `yarn test:integration` against the [local services](#local-services) and the Midnight
stack from `.env.local`; they create rows under a caller name of their own and delete them
afterwards. Only unit tests sit beside the code. Tests sit beside the code they cover and are table driven: an
array of cases, each naming the doubles its collaborators are built from, the arguments and a
check, run through `test.each`. `mock<Interface>(name, methods)` in `src/lib/testing/mock.ts`
builds a double that answers with the methods a case supplies and throws on any other call, so a
dependency the case did not script cannot be used unnoticed. `MemoryRepository` in
`src/lib/repository/repository-memory-impl.ts` is a working in-memory repository for flow tests.
`vitest.config.ts` resolves the `@/` alias and resolves `server-only` to its empty module under
the `react-server` condition, as Next.js's server graph does, so server modules load in the runner.

```bash
yarn test
```

```bash
yarn test:integration
```

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
the resource and acts on its current state, so a redelivered event is harmless.

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
  `event-consumer-hub.ts` the hub that owns the process's consumers. `startEventConsumerHub()`
  reads the topic as the `full-stack-demo.events` group, hands each event to every consumer that
  wants it in registration order, and commits the offset only after they all return. A handler
  that throws leaves the offset uncommitted, so the event is redelivered after a restart delay.

Domain events are lifecycle events, one per state a resource enters, defined with
`defineEvent(type, dataSchema)` beside the state controller that publishes them (for example
`TRANSACTION_EVENT_BY_STATE` in `src/lib/midnight/transaction-v1/transaction-state-controller.ts`).
A definition creates typed events for the publisher and parses event data for the consumer, so
the consumer is an adaptor for the bus: it matches the definitions it wants, parses the data and
calls a resolver. Handlers run outside any database transaction, since the resolver behind them
decides where its writes go.

`src/server/start.ts` starts the hub and the processor with the server process, and it is where
consumers are registered. Next.js evaluates instrumentation and request code (server actions,
route handlers) in separate module graphs, so each graph has its own backend: a consumer
registered from a server action joins a hub that never consumes. Request code only publishes. The
Kafka client is listed in `serverExternalPackages` in `next.config.ts`, since it resolves its own
files through `import.meta.url` and only works unbundled.

## Midnight transactions

`src/lib/midnight/transaction-v1` carries one circuit call from built to on chain. The states
name what the row waits for (`AwaitingProof`, `AwaitingWallet`, `AwaitingSubmission`,
`AwaitingInclusion`, then `Succeeded`, `Failed` or `Expired`), the legal transitions and the
fields each state holds are the table in `transaction-state-machine.ts`, and
`TransactionStateController` is the only writer, one method per action, each publishing the
lifecycle event of the state entered. `TransactionStateResolver` does what the current state
needs through the `TransactionLedger` port and applies one transition, and
`TransactionEventConsumer` nudges it on every lifecycle event.

`TransactionLedgerMidnightImpl` is the ledger behind the local or stagenet services: `prove`
deserialises the unproven bytes and proves them through the proof server with the prover keys
under `MIDNIGHT_ZK_ASSETS_ROOT`, `submit` sends the wallet's finalized bytes to the node
over one WebSocket connection and returns one of the transaction's ledger identifiers, and
`status` asks the indexer for that identifier and maps `SUCCESS`, `PARTIAL_SUCCESS` and
`FAILURE` to the ledger outcome. A transaction the indexer has not recorded stays pending until
its TTL expires it.

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
manifests the packages ship, and skips a bundle that already verifies. A further vault adds its
own bundle beside them. It needs the compact launcher with the compiler version the package pins,
and the first build takes minutes.

## Composition

Everything under `src/lib` is inert: a class takes its dependencies as constructor arguments and
nothing there builds anything. `createBackend()` in `src/server/backend.ts` builds the whole
dependency graph in dependency order from the server configuration, and `getBackend()` memoises
it once per module graph (`lazySingleton()` in `src/lib/lazy-singleton.ts` drops a failed build
so the next call retries). Server actions live under `src/server/actions`: a `'use server'` file
may export only async functions, so each action is one line that reaches its adaptor through
`getBackend()`.

## ERC-20 vault deposit API

`src/lib/midnight/ethereum-erc20-vault/deposit-v1` is the skeleton of a resource-oriented API for vault
deposits, designed in `docs/architecture.md` under Deposit API. This UI is its only client, so it
is exposed as server actions rather than HTTP routes. A deposit is named
`callers/{caller}/ethereum-erc20-vault-deposits/{deposit}`, where the caller is the depositor's
64-character hex identity commitment and the deposit id is a UUID the server assigns.

- `deposit.ts` holds the resource schema and its type, with the resource-name format and builder,
  shared by the server and the browser. The generic EVM address, base-unit amount, hex and UUID
  schemas live in `src/lib/value-schemas.ts`.
- `deposit-repository.ts` is the storage interface, `Repository<Deposit>`, and
  `deposit-repository-sql-impl.ts` its Postgres implementation over the
  `midnight_ethereum_erc20_vault_deposits_v1` table (see Repositories under Database).
- `deposit-service.ts` is the API's method set and `deposit-service-impl.ts` the implementation.
- `deposit-service-adaptor.ts` is `DepositServiceAdaptor`, which only translates: the secret
  becomes a `Caller`, the arguments are validated, the service is called, and its result becomes
  `{ ok: true, deposit }` or `{ ok: false, error }`. The server actions the UI calls,
  `startDeposit(callerSecret, args)` and `getDeposit(callerSecret, args)` in
  `src/server/actions/deposit-actions.ts`, each forward to it. Amounts cross as `bigint`.

```tsx
'use client'

import { startDeposit } from '@/server/actions/deposit-actions'

const result = await startDeposit(callerSecret, {
  depositRequest: { erc20Address, amount: 1000000n },
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
