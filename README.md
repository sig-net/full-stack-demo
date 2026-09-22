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
yarn dev
```

The development server listens on http://localhost:3000.

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

| Path                | Contents                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| `src/app`           | App Router files: layouts, pages, `not-found`, `icon.svg`, global CSS. |
| `src/components`    | Application React components.                                          |
| `src/components/ui` | Components written by the shadcn CLI.                                  |
| `src/lib`           | Non-React modules.                                                     |
| `public/icons`      | The sig.network wordmark and swan, in black and white variants.        |

Pages and layouts are server components. A component opts into the browser with `'use client'`
only when it needs state, effects or browser APIs, as `src/components/mode-toggle.tsx` does.

## Styling and theme

`src/app/globals.css` is the single source of the theme. It defines the sig.network palette as
Tailwind colours (`brand`, `clamshell`, `dark-neutral` and the status scales), then maps the
semantic tokens (`background`, `primary`, `muted`, `border` and so on) onto that palette for the
light theme under `:root` and for the dark theme under `.dark`. Components use the semantic
tokens, never palette values directly.

`next-themes` owns the light or dark choice. It follows the operating system until the visitor
uses the toggle in the app bar, then remembers the choice in local storage.

Geist Sans and Geist Mono come from the `geist` package, which loads its bundled font files
through `next/font/local`, so the application serves the fonts itself.

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
