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

| Variable                    | Secret | Purpose                                                                                              |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `MIDNIGHT_NETWORK_ID`       | No     | `undeployed`, `stagenet`, `preview`, `preprod` or `mainnet`. Selects the default Midnight endpoints. |
| `MIDNIGHT_INDEXER_URL`      | No     | Optional override of the indexer GraphQL endpoint.                                                   |
| `MIDNIGHT_INDEXER_WS_URL`   | No     | Optional override of the indexer subscription endpoint.                                              |
| `MIDNIGHT_NODE_URL`         | No     | Optional override of the node RPC endpoint.                                                          |
| `MIDNIGHT_PROOF_SERVER_URL` | No     | Optional override of the proof server, `http://127.0.0.1:6300` by default.                           |
| `EVM_CHAIN_ID`              | No     | Ethereum chain ID. `1`, `11155111` and `31337` have a default RPC.                                   |
| `EVM_RPC_URL`               | No     | Optional override of the RPC endpoint, required for other chains.                                    |
| `DB_CONNECTION_STRING`      | Yes    | Example secret.                                                                                      |

The defaults live in `src/lib/config/midnight-config.ts` and `src/lib/config/ethereum-config.ts`,
each of which owns its variables' schema and builds its section of the client configuration.

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
  const { midnight } = useConfig()
  return <a href={midnight.nodeURL}>{midnight.nodeURL}</a>
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

## Styling and theme

`src/app/globals.css` is the single source of the theme. It defines the sig.network palette as
Tailwind colours (`brand`, `clamshell`, `dark-neutral` and the status scales), then maps the
semantic tokens (`background`, `primary`, `muted`, `border` and so on) onto that palette for the
light theme under `:root` and for the dark theme under `.dark`. Components use the semantic
tokens, never palette values directly.

The light theme values come from the Product UI design in Figma: `border` is dark neutral 50
(dividers), `input` is dark neutral 300 (control borders), `primary` is the polar 200 button fill
with dark neutral 400 text and border. The `Button` variants map onto the design's hierarchies:
`default` is Primary, `secondary` is Secondary, `ghost` is Tertiary and `link` is Link, with sizes
`default` (40px) and `lg` (44px) matching Size md and lg.

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
