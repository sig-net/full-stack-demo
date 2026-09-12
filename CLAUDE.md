# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
yarn dev          # Start dev server with Turbopack
yarn build        # Production build
yarn lint         # ESLint check
yarn lint:fix     # ESLint auto-fix
yarn typecheck    # TypeScript type checking
yarn format       # Prettier check
yarn format:fix   # Prettier format
yarn zk-assets    # Regenerate + verify the Midnight zk assets under public/zk (needs the Compact toolchain)
```

## Midnight Vault

The shielded ERC-20 vault flows live in `src/lib/midnight/`. The compiled vault contract, its witnesses and
ledger paths come from `@sig-net/midnight-examples-erc20-vault-contract`, the signet protocol SDK from
`@sig-net/midnight`. Contract addresses resolve from `NEXT_PUBLIC_MIDNIGHT_NETWORK_ID` through those
packages in `src/lib/midnight/env.ts` (the two address env vars are overrides for a local undeployed stack).

Proving fetches two zk asset trees from `NEXT_PUBLIC_ZK_CONFIG_ORIGIN` (the app's own `/zk` path when unset):
the vault at `/{keys,zkir,compiler}` and the signet contract at `/signet/{keys,zkir,compiler}`.
`yarn zk-assets` lays both out under `public/zk` and prints the manifest hashes pinned in
`src/lib/midnight/zk-manifest-hashes.ts`.

## Environment Configuration

Validated via Zod in `src/lib/config/env.config.ts`:

- `getClientEnv()` - Client-safe vars (NEXT_PUBLIC_*)
- `getFullEnv()` - Server-side only (includes secrets)

## Code Conventions

- Path alias: `@/*` maps to `./src/*`
- Unused variables must be prefixed with `_`
- TypeScript strict mode with `noUncheckedIndexedAccess`
- All pages are client components (`'use client'`) with `export const dynamic = 'force-dynamic'`
- All caching must go through React Query - no custom caching solutions
- Never hardcode token decimals - always fetch from on-chain via `fetchTokenDecimals()`
- **Do not use `useMemo`, `useCallback`, or `React.memo`** - React Compiler handles memoization automatically

## Before Completing Any Task

```bash
yarn lint && yarn typecheck
```

Only run `yarn build` if explicitly asked.
