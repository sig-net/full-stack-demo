# Full stack demo

A sig.network demonstration application, built with Next.js (App Router), React, Tailwind CSS
and shadcn/ui components on Base UI.

## Requirements

- Node.js 22.12 or newer.
- Yarn 4, supplied by Corepack from the `packageManager` field in `package.json`. Run
  `corepack enable` once if `yarn --version` does not report 4.x inside this folder.

## Getting started

```bash
yarn install
```

```bash
cp .env.example .env.local
```

```bash
yarn dev
```

The development server listens on http://localhost:3000. The variables in `.env.local` are
described under [Configuration](#configuration).

## Scripts

| Script              | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `yarn dev`          | Start the development server.                                    |
| `yarn build`        | Create a production build.                                       |
| `yarn start`        | Serve the production build.                                      |
| `yarn typecheck`    | Generate the Next.js route types, then type check with `tsc`.    |
| `yarn lint`         | Lint with oxlint, including its type-aware rules.                |
| `yarn format`       | Format with oxfmt.                                               |
| `yarn format:check` | Report files that are not formatted.                             |
| `yarn check`        | Run the type check, the linter and the format check in sequence. |

## Layout

| Path                      | Contents                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/app`                 | App Router files: the root layout, `error`, `global-error`, `not-found`, `icon.svg`, global CSS. |
| `src/app/(configured)`    | Routes that render inside `ConfigProvider`, gated by its layout: `/` and `/design`.              |
| `src/components`          | Application React components.                                                                    |
| `src/components/ui`       | Components written by the shadcn CLI.                                                            |
| `src/components/contexts` | React contexts: each file holds a context, its provider and its `use<Name>` hook.                |
| `src/lib`                 | Non-React modules.                                                                               |
| `src/lib/config`          | Server configuration loading and the client configuration type.                                  |
| `public/icons`            | The sig.network wordmark and swan, in brown (light theme) and white (dark theme) variants.       |

Pages and layouts are server components. A component opts into the browser with `'use client'`
only when it needs state, effects or browser APIs, as `src/components/mode-toggle.tsx` does.

## Configuration

Configuration is read from environment variables on the server at request time. Nothing is baked
in at build time, so one build serves every environment. `.env.example` lists the variables:

| Variable                              | Secret | Purpose                                                                                                           |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `MIDNIGHT_NETWORK_ID`                 | No     | `undeployed` or `stagenet`. Selects the default Midnight endpoints and the published contract values.             |
| `MIDNIGHT_INDEXER_URL`                | No     | Optional override of the indexer GraphQL endpoint.                                                                |
| `MIDNIGHT_INDEXER_WS_URL`             | No     | Optional override of the indexer subscription endpoint.                                                           |
| `MIDNIGHT_NODE_URL`                   | No     | Optional override of the node RPC endpoint.                                                                       |
| `MIDNIGHT_PROOF_SERVER_URL`           | No     | Optional override of the proof server, `http://127.0.0.1:6300` by default.                                        |
| `MIDNIGHT_SIGNET_CONTRACT_ADDRESS`    | No     | 32-byte hex. Overrides the SDK's published signet singleton address, required for `undeployed`.                   |
| `MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY` | No     | secp256k1 key in SEC1 hex or `secp256k1:base58`. Overrides the published MPC root key, required for `undeployed`. |
| `MIDNIGHT_VAULT_CONTRACT_ADDRESS`     | No     | 32-byte hex. Overrides the published ERC20 vault address, required for `undeployed`.                              |
| `EVM_CHAIN_ID`                        | No     | Ethereum chain ID. `1`, `11155111` and `31337` have a default RPC.                                                |
| `EVM_RPC_URL`                         | No     | Optional override of the RPC endpoint, required for other chains.                                                 |
| `DB_CONNECTION_STRING`                | Yes    | Example secret.                                                                                                   |

Each section of the client configuration is owned by one module under `src/lib/config`
(`midnight-network-config.ts`, `midnight-signet-config.ts`, `midnight-vault-config.ts`,
`ethereum-config.ts`): it declares the schema of its variables, holds its defaults and builds its
section. The Midnight network set is the SDK's `MidnightNetwork` enum narrowed to the two networks
the application supports, and contract addresses and public keys are validated and normalised with
the SDK's own parsers.

Next.js reads `.env.local` from the project root, never from `src`. In deployed environments the
same variables are set on the process.

### Server and client halves

`src/lib/config/server-config.ts` validates `process.env` with one zod schema composed from the
section modules and produces a `ServerConfig` with two halves: `secret` and `client`. A validation failure names the offending
variable. The load is shared by every request through one promise, and a rejected load is dropped
so the next request retries.

- Server code (layouts, pages, route handlers, server actions) calls `getServerConfig()` and may
  read both halves.
- `getClientConfig()` returns the `client` half only. `ClientConfig` (`src/lib/config/client-config.ts`)
  is the one place that defines what the browser may see, and a secret can only reach the browser by
  being added to that type.
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
the presentation.

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
on the left and the 413px swap column on the right. Below it the sections stack as swap, balances,
activity and the page scrolls under the app bar, which the `(configured)` layout keeps at the top.

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
