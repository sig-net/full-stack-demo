# Local shielded ERC-20 vault demo

Run the UI against a local Midnight stack and an Anvil fork of Sepolia. The examples setup deploys Signet and the vault, initialises the vault, funds setup roles, starts fakenet and generates the UI configuration. The upstream Sepolia RPC URL belongs only to Anvil. Browser, backend and responder transactions use the local fork.

## Prerequisites

Use Node 24, Yarn, Docker with Compose, and the Compact launcher with compiler `0.33.0-rc.2` available. The compiler reports `0.33.0`, with language `0.25.0` and runtime `0.18.0-rc.1`. Proving and the first compilation are substantial local workloads. Keep the proof server running throughout setup and use.

The companion examples checkout must contain the local setup changes on [codex/erc20-vault-local-setup](https://github.com/sig-net/midnight-examples/tree/codex/erc20-vault-local-setup), published at commit `5c3b578` and based on `ad30bf8dbb5642945aa13ec0f54840c5e76449c0`. The UI uses vault release `0.1.0` and Signet SDK `0.21.0`. Setup checks the source and compiled artefacts against the UI's installed release before deploying. On another machine, clone the examples repository and check out that branch. The commands below use the local worktree at `/Users/bernard/Projects/github.com/sig-net/midnight-examples-setup-script`. Adjust checkout paths for your machine.

The only required environment input is `SEPOLIA_FORK_RPC_URL` in the examples checkout's private `.env`. Supply an upstream Sepolia HTTP(S) RPC URL there. Keep this file private and leave it available while Anvil runs. Setup generates independent role seeds, vault credentials and testing user credentials.

## Start the local stack

Install the locked dependencies in both this UI checkout and the companion examples checkout. Run this command from each checkout:

```bash
YARN_ENABLE_GLOBAL_CACHE=false YARN_CACHE_FOLDER="$PWD/.yarn/cache" YARN_GLOBAL_FOLDER="$PWD/.yarn/global" yarn install --immutable
```

Inspect existing Docker services before starting the stack. Ports 9944, 8088, 8545 and 6300 must belong to the intended local node, indexer, Anvil and proof server. The examples Compose configuration uses proof-server image `midnightntwrk/proof-server:9.0.0-rc.5_experimental`. From `/Users/bernard/Projects/github.com/sig-net/midnight-examples-setup-script`, after verifying any existing container uses that image and responds on port 6300, this conditional preserves it or starts the Compose service:

```bash
docker inspect midnight-proof-server >/dev/null 2>&1 || docker compose up -d --no-deps proof-server
```

If a compatible proof server already owns port 6300, preserve that service and set `FAKENET_MIDNIGHT_PROOF_SERVER_URL=http://host.docker.internal:6300` in the examples `.env` so the responder can reach it.

From `/Users/bernard/Projects/github.com/sig-net/midnight-examples-setup-script`, start the other services:

```bash
docker compose up -d --no-deps node indexer evm
```

Then run setup from that same checkout. Keep its log private, since upstream deployment tooling can print role configuration:

```bash
umask 077
mkdir -p .local-demo
yarn setup-local:erc20-vault --ui-directory /Users/bernard/Projects/github.com/sig-net/full-stack-demo-deployment > .local-demo/setup.log 2>&1
```

Setup leaves services running, closes its wallet connections and writes:

| Output                                  | Purpose                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| UI `.env.local`                         | Public defaults, deployment addresses, MPC key and local faucet endpoint overrides |
| Examples `.local-demo/testing-user.env` | Optional testing wallet seed and independent vault caller secret                                                  |
| Examples `.local-demo/setup.env`        | Private resumable setup state                                                                                     |
| Examples `.local-demo/instance.json`    | Local Anvil instance identity                                                                                      |

Generated credential files use mode 0600. Setup refuses to overwrite a UI `.env.local` without its generated-file header. Move or reconcile a manually maintained file first. Never copy server credentials into `NEXT_PUBLIC_` variables. Testing credentials are for optional manual entry and are not restored into the browser automatically.

## Prepare assets and start the UI

From this UI checkout:

```bash
yarn zk-assets
yarn dev
```

The asset command verifies complete vault and Signet trees in staging before replacing `public/zk`. The vault uses `/zk/{keys,zkir,compiler}` and Signet uses `/zk/signet/{keys,zkir,compiler}`. A failed or incomplete preparation preserves the serving tree. The package manifests and browser-pinned hashes must agree. `NEXT_PUBLIC_ZK_CONFIG_ORIGIN` defaults to this app's `/zk` URL.

Open [the local app](http://localhost:3000). The browser starts with **undeployed** and EVM **Local testnet** selected. Midnight connection/deployment fields are empty, and the local EVM chain ID is discovered from Anvil. Open the header **Configuration** gear and enter the generated public values from the UI `.env.local`:

| Section | Field | Generated value |
| --- | --- | --- |
| ERC20 vault | MPC public key | `NEXT_PUBLIC_MPC_SECP256K1_PUBKEY` |
| ERC20 vault | Contract address | `NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS` |
| ERC20 vault | Signet contract address | `NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS` |
| Midnight | Network | `undeployed` |
| Midnight | Indexer URL | `NEXT_PUBLIC_MIDNIGHT_INDEXER_URL` |
| Midnight | Indexer WebSocket URL | `NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL` |
| Midnight | Node URL | `NEXT_PUBLIC_MIDNIGHT_NODE_URL` |
| Midnight | Proof server URL | `NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL` |
| EVM | Chain | `11155111` |
| EVM | RPC URL | `http://127.0.0.1:8545` |
| EVM | Explorer URL | Leave empty |

Select Midnight **undeployed** and EVM **Local testnet**, then enter the generated endpoints and deployment values. Wait for local chain discovery, or enter the generated chain ID, and choose **Apply**. Keep the EVM RPC local and its explorer empty for this stack. Refresh requires entering this configuration again. The browser configuration stays independent from the server's fixed local faucet configuration.

Connect a Midnight seed wallet with a fresh hexadecimal seed, or manually paste the testing seed from the private output. Wallet synchronisation completes even when the fresh wallet has no funds. Select or generate a separate 32-byte vault identity. Keep that secret outside the app if you want to return to the same identity.

For an EVM extension, configure a local network with RPC `http://127.0.0.1:8545`, chain ID `11155111`, and ETH as its currency. Select this local network before connecting. Local transaction hashes remain visible without links to a public explorer.

Choose **Fund local wallets** for connected local wallets. The action requests separate ETH, ERC-20 and NIGHT faucets only for deficits. Local targets are 1 ETH, 100 USDC using on-chain decimals, and 1,000,000,000,000 NIGHT base units. Choose **Register NIGHT for DUST** after NIGHT arrives, then wait for spendable DUST. Registration is a user-wallet action and is unavailable for connectors that do not expose that capability. Deposit and vault ETH addresses remain visible and copyable, with explicit local ETH funding controls. On public or mixed configurations, the faucets are unavailable and users fund their wallets and vault addresses directly.

The local funding reserve indicator requires measured balances of at least 0.01 ETH and 1 USDC. EVM deposit eligibility uses the selected token, requested amount, fetched decimals and estimated network fee. Midnight readiness requires at least 10 DUST. One DUST equals 1,000,000,000,000,000 SPECK. The local 0.1 USDC browser deposit consumed 0.691887923870713 DUST across start and settlement, below the 10 DUST reserve. The responder paid a separate 0.315009887444318 DUST for its signature and execution attestation. Fees vary with the transaction and current ledger parameters. Unknown balances require refresh and cannot unlock a transaction.

## Deposit and recovery

In **Deposit**, select USDC and enter `0.1`. Confirm the EVM transfer through the connected wallet. Seed wallets sign in the page, while browser wallets request approval in their extension. After confirmation, choose the explicit Midnight continuation to sweep the displayed deposit address into the shielded vault.

Preserve the destination and transaction hash when troubleshooting. A failed continuation can resume from the confirmed transfer without sending again.

The deposit dialog shows **Current deposit request ID** after the Midnight request is confirmed. Its copy control remains available during settlement, after a continuation failure and after completion. Before confirmation, the dialog explicitly says the ID is not available yet.

After an EVM sweep has confirmed, restore the same vault identity, select the deposit token, paste the request ID from Activity into **Recover a deposit by request ID**, and choose **Recover pending deposit**. **Paste request ID** reads the clipboard, while ordinary keyboard paste also works. **Use current request** deliberately fills the recovery input from the displayed request when recovery is eligible. Recovery reads the exact pending amount from the vault. It validates the identity and token, reuses the confirmed sweep and submits settlement. A manual continuation is available for a transfer made outside the app.

Open the Midnight or EVM wallet menu in the header to select a seed or browser wallet independently. Each menu identifies the connected wallet kind and account and offers disconnect. The separate **Vault identity** control in the header and initial home screen opens an anchored editor with generate, paste, copy, apply and clear controls. Its green dot means a validated secret is applied, independently of wallet connection or vault readiness. Closing the editor clears its temporary draft and feedback. Losing the separate secret can prevent access to vault funds or completion of a deposit after its EVM transfer. Keep a copy for re-entry after refresh. EVM seeds accept 16–64 hexadecimal bytes and derive the first Ethereum BIP-44 account. EVM seed wallets sign in the page without an extension approval prompt. Closing a seed form clears its input.

Midnight browser discovery lists injected connector API 4 wallets by their own names. Connection checks the reported network. The extension owns its balance and submission services, and the app uses the applied endpoints for vault reads and proofs. Connector balancing and submission methods enable vault transactions. If those methods are missing, the UI reports that capability limitation while wallet identity and balance reads remain available. Local Midnight funding and automatic rebuilding require the seed adapter. Browser wallet users fund, register NIGHT and resynchronise through their extension, then reconnect. Browser credentials remain in the extension.

Wallet connection, vault identity, binding and balances have separate readiness states. **Retry vault** in the identity panel retries binding. **Retry balances** or **Refresh balances** retries reads. Disconnect forgets the wallet seed and retains the selected identity in page memory. Clearing identity preserves wallet connections. Refresh clears wallet seeds and the applied identity. Wallet replacement cannot adopt the result of an older session's funding or transaction.

Withdraw, swap, supply and redeem use the MPC path independently of the EVM extension. One shared operation runs at a time. Activity distinguishes success, refund, failure and interrupted observation. Reloading a pending record preserves its request and transaction identifiers and marks observation interrupted, without asserting a chain failure. A failed balance refresh after settlement does not turn settlement into failure. EVM output is reconstructed from the configured fork's executed transaction and checked against the on-chain response attestation before settlement.

## Swap pricing

Pool discovery and each concurrently queried fee tier have a 10-second deadline, including response
body reads. Changing the selected amount, tokens or vault session cancels obsolete quote reads.
Pricing failures show an error and **Retry pricing**. A pool with no viable quote is distinguished
from an RPC failure. Other successful fee tiers can still provide a quote when one tier fails. Quotes whose pool gas
estimate already reaches the vault’s fixed swap gas allowance are excluded from tier selection.

The input amount is the maximum spend. The swap obtains a fresh quote before creating its request,
applies the selected slippage to determine the exact output, and returns unspent input as shielded
change at settlement. Completed Activity and the resulting balances establish successful execution.

## Runtime configuration

The header gear opens **Configuration**, grouped into ERC20 vault, Midnight and EVM. Browser initialisation uses the selected Midnight network's defaults. `NEXT_PUBLIC_MIDNIGHT_NETWORK_ID` selects that initial network. Generated endpoint, address and MPC environment values configure the server. Enter those public values explicitly in the browser for a local stack.

| Midnight network | Connection defaults | EVM and vault defaults |
| --- | --- | --- |
| undeployed | Empty node and indexer endpoints | Local Anvil RPC with chain discovery, empty explorer and vault deployment |
| stagenet | Stagenet node and v4 indexer endpoints | Sepolia public endpoints and installed package deployments |
| preview, preprod | Their published node and v4 indexer endpoints | Sepolia public endpoints and any published deployment values |
| mainnet | Mainnet node and v4 indexer endpoints | Ethereum mainnet public endpoints and any published deployment values |

Every network defaults to the local proof server at `http://127.0.0.1:6300`. Each published vault address, Signet address and MPC key resolves independently. Missing values stay empty and prevent dependent operations. The installed packages currently publish all three only for Stagenet. Transport probes accepted HTTP GraphQL and WebSocket connection negotiation on all four public networks. These probes do not establish contract or proof compatibility on those networks.

Edits remain an unapplied local draft until **Apply** validates and commits all sections together. **Discard** reloads applied values. **Reset to network defaults** prepares a fresh draft for the selected network and requires Apply. Selecting a different network resets all three draft sections. Returning to a network uses its defaults, without remembering overrides. Selecting the current network preserves edits. Applied configuration and wallet sessions change only after Apply. A stale editor cannot overwrite a newer applied revision and offers Discard to reload.

Clearing a field means unset. Missing inputs keep setup and the independent vault identity available. A malformed non-empty field prevents Apply. Contract addresses and valid compressed/uncompressed secp256k1 keys are normalised. Editing the HTTP indexer URL also replaces its WebSocket twin. An explicit WebSocket edit lasts until the next HTTP edit.

EVM **Local testnet** selects Anvil at `http://127.0.0.1:8545`, discovers its chain ID and leaves the explorer empty. **Sepolia testnet** uses chain `11155111`, `https://ethereum-sepolia-rpc.publicnode.com` and `https://sepolia.etherscan.io`. **Mainnet** uses chain `1`, `https://ethereum-rpc.publicnode.com` and `https://etherscan.io`. Selecting EVM local/mainnet prepares Midnight undeployed/mainnet. Selecting Sepolia preserves Midnight Stagenet, Preview or Preprod when already selected, otherwise it prepares Stagenet. Subsequent URL and chain overrides remain editable without another automatic network selection. Chain-only overrides preserve endpoints. Clearing the chain clears both endpoints. Generic EVM wallets can use an independently configured chain. Number-based wallet APIs require a safely representable chain ID. Public presets use fixed chain IDs for connection without requiring application RPC chain discovery. Browser extensions still verify their reported chain. Local and explicit nonstandard chain overrides require RPC verification. Failed local discovery leaves EVM unavailable while other configuration edits remain applicable. Vault asset routing requires Sepolia, with each operation checking its required assets and contracts.

Applying an EVM chain/RPC change requires EVM reconnection. Applying Midnight network/endpoints requires Midnight reconnection. Either change invalidates the vault binding, and a network change invalidates both wallet sessions. Vault address, Signet address and MPC edits rebind the vault while retaining the independent caller identity. Explorer-only edits preserve signing sessions and the operational fingerprint. Submitted transfers and Activity retain captured identifiers, destination and explorer metadata. Local receipts require an empty or local explorer.

The server provides local development NIGHT, ETH and ERC-20 faucets only. It fixes Midnight to undeployed, EVM to chain `11155111`, and uses the canonical local genesis wallet for NIGHT. Its endpoint overrides are server-only and can point only to local services. The app receives a public descriptor containing those endpoint settings and development availability. A local funding action requires exact applied endpoint matches, while vault addresses and presentation fields do not affect eligibility. Client configuration, wallets, registration and vault operations remain independent. Restart Next.js after changing server faucet endpoint overrides.

## Reuse and reset

Rerun the setup command with the same live stack to reuse its addresses and private role configuration. A setup lock prevents concurrent runs. Remove `.local-demo/setup.lock` only after confirming an interrupted process has stopped. Asset preparation has a separate `public/zk.prepare.lock` with the same recovery rule.

A reset discards the local chain balances and pending requests. Preserve any state you need before proceeding. Verify that `midnight-node`, `midnight-indexer`, `local-evm` and `fakenet-responder` belong to this checkout's Compose project. Stop and remove only these four containers:

```bash
docker stop fakenet-responder
docker stop midnight-indexer midnight-node local-evm
docker rm fakenet-responder midnight-indexer midnight-node local-evm
```

Preserve the proof server. From the examples checkout, create the fresh owned services:

```bash
docker compose up -d --no-deps node indexer evm
```

Setup rejects a changed Anvil instance or missing Midnight contracts. Regenerate configuration and deploy against the fresh stack with:

```bash
yarn setup-local:erc20-vault --ui-directory /Users/bernard/Projects/github.com/sig-net/full-stack-demo-deployment --reset-config > .local-demo/reset-current.log 2>&1
```

The reset option archives the saved configuration and clears only generated chain-bound values from `.local-demo/setup.env` and the root `.env`. The reset option refuses a still-current stack and conflicts with manually changed saved values. It preserves the upstream URL and role credentials. A fresh setup establishes a fresh local stack identity. Restart Next.js after regenerated configuration. Do not reset or stop services belonging to another checkout.

If setup fails, inspect the private setup log and rerun after resolving the reported prerequisite or service failure. A compiler or release mismatch needs matching installed dependencies. A fork identity error needs reconciled local configuration. A DUST wait needs registration and indexer progress. A transaction submission error requires checking actual chain confirmation before retrying.

## Production container

The root `Dockerfile` packages the application for a Kubernetes cluster. Its stages install the
locked dependencies with the pinned Yarn launcher, regenerate and verify the vault and Signet zk
asset trees with the pinned Compact toolchain, run the standalone Next.js production build, and
copy only the traced server, static output and `public` tree into a `node` runtime image that
runs as the unprivileged `node` user. The image serves `/zk/{keys,zkir,compiler}` and
`/zk/signet/{keys,zkir,compiler}` from `public/zk` exactly as local development does. The
build works with BuildKit and the legacy builder on `linux/arm64` and `linux/amd64`, and needs
network access to the npm registry, GitHub releases and Google Fonts.
`.dockerignore` keeps every `.env` file except `.env.example`, the local `public/zk` tree and
`node_modules` out of the build context.

```bash
docker build -t full-stack-demo:local .
```

Next.js inlines `NEXT_PUBLIC_` values into the browser bundle at build time. Pass the
deployment's public configuration as build arguments: every `NEXT_PUBLIC_` variable in
`.env.example` has a `--build-arg` of the same name. Unset arguments keep the application
defaults, which select the undeployed network on loopback endpoints. Server-only values
(`RELAYER_PRIVATE_KEY` and the local genesis and Anvil identifiers) are runtime environment for
the container, supplied through Kubernetes secrets. The API routes read public values from the
runtime environment as well, so give the container the same public values the image was built
with. Local wallet funding requires development mode and is unavailable in the production image.

The server listens on `PORT` (3000 by default) on every interface. This runs it on host port 3030:

```bash
docker run --rm -p 3030:3000 full-stack-demo:local
```

Open [the container app](http://localhost:3030). Both zk manifests are then available at
`/zk/compiler/contract-manifest.json` and `/zk/signet/compiler/contract-manifest.json`.

### Publish the image

The `docker-publish` workflow in `.github/workflows` publishes the image to Google Artifact
Registry as `europe-west1-docker.pkg.dev/near-cs-dev/midnight/full-stack-demo-ui:<tag>` for a
pushed tag of the form `vX.Y.Z` (stable) or `vX.Y.Z-rc.N` (release candidate). The image tag is
the git tag, including the `v`. Any other tag shape fails the first job. A stable tag must point
at a commit on `main`, while release candidates may come from any branch. Each architecture
builds on its own native runner. The `publish` job builds `linux/amd64`, pushes it as
`<tag>-linux-amd64`, waits for the parallel `build-arm64` job's image tarball, pushes that as
`<tag>-linux-arm64`, and combines both into the multi-architecture manifest `<tag>`. Layers are
rebuilt from scratch on every run, so a publish takes roughly the length of one image build.

The workflow needs a repository environment named `deploy` with required reviewers. Only the
`publish` job runs in it, and it asks for approval as soon as the tag checks pass, so a release
needs one approval at the start. The `build-arm64` job runs without credentials and publishes
nothing. Configure the environment with:

| Environment setting         | Purpose                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret `GOOGLE_CREDENTIALS` | The Google Cloud service account JSON bundle (`"type": "service_account"`, project `near-cs-dev`) with write access to the `midnight` Artifact Registry repository |
| Variables `NEXT_PUBLIC_*`   | The deployment's public configuration. Each non-empty variable becomes a build argument of the same name                                                            |

Pushing a tag such as `v0.1.0-rc.1` starts the run. Dispatching the workflow manually works only
from a release tag ref.

## Configuration and checks

`.env.example` lists the local defaults and generated fields. Hosted operation remains configurable through validated EVM and Midnight endpoint overrides and compatible deployment values. Local faucet funding requires development mode, Midnight `undeployed`, loopback services, Anvil chain ID `11155111` with live Anvil metadata, and Midnight chain `undeployed1`. The server exposes separate local NIGHT, ETH and ERC20 faucet endpoints.

For development, `package.json` defines the available development, production, lint, typecheck,
formatting and asset-preparation scripts. `tsconfig.json` maps `@/*` to `src/*` and enables strict
typing with checked indexed access. React Compiler is enabled in `next.config.ts`. Production
compilation is configured to skip TypeScript errors, so the separate typecheck is essential.

Public chain configuration is defined in `src/lib/config/evm.ts` and
`src/lib/config/midnight.ts`. `src/lib/config/runtime.ts` composes applied public configuration,
and `src/lib/midnight/env.ts` captures deployment inputs for lazy address resolution. Explicit
vault and Signet address overrides take precedence over package defaults and are required for
the undeployed network. Server faucet endpoint overrides use the `LOCAL_FAUCET_*` environment
variables and the NIGHT faucet imports the canonical genesis seed from the deployment package.

The vault package `@sig-net/midnight-examples-erc20-vault-contract` supplies generated contract
types, witnesses and deployment defaults. `@sig-net/midnight` supplies the Signet SDK and its
deployment defaults. Vault provider assembly is in `src/lib/midnight/vault-providers.ts`,
including the bounded prover-key cache and manifest verification against the hashes in
`src/lib/midnight/zk-manifest-hashes.ts`. The asset preparation workflow is described above.

Run the required UI checks:

```bash
yarn lint && yarn typecheck
```

Executed validation covered a clean scoped reset and deployment, kept-stack reuse with unchanged configuration, both served asset manifests and asset reuse, actual EVM funding and repeat funding, fresh browser NIGHT funding and signed DUST registration, and a real MetaMask 0.1 USDC deposit through fakenet to final Midnight settlement. The shielded balance and completed Activity entry survived credential re-entry after refresh. Static checks and isolated rejection, reset and lifecycle tests passed. Live withdrawal, swap, lending and comprehensive failure testing remain future work.

## Agent browser verification

**TIP:** Ask your coding agent to use the `local-vault-e2e` skill for local browser verification:
`$local-vault-e2e` in Codex, `/local-vault-e2e` in Claude Code. It handles stack checks, Playwright
ownership, MetaMask interaction and deposit evidence within the requested scope. A wallet refactor
smoke check does not require a new deposit or chain reset. One copy of the skill lives in
`.agents/skills/local-vault-e2e`, and `.claude/skills/local-vault-e2e` is a committed symlink to it.

Playwright MCP is pinned as a project development dependency. After the immutable dependency
installation above, verify the guarded launcher and its public upload fixture from this checkout:

```bash
node scripts/local-vault/chromium-post-data-cap.test.mjs
node scripts/local-vault/transport-preflight.test.mjs
node scripts/local-vault/transport-preflight.ts
```

The fixture uses an isolated headless browser and a temporary local sink. It verifies two complete
proving-key uploads by hash and then checks browser interaction. It preserves the prepared wallet
profile. The launcher limits Chromium's captured POST bodies to prevent the observed oversized
protocol-message crash. HTTP uploads remain complete, while captured request bodies are omitted.
Version and source checks stop an incompatible tool version before browser use.

Configure the Playwright MCP command as the absolute path to Node 24. Its first argument is this
checkout's `scripts/local-vault/playwright-launcher.mjs`, followed by `--user-data-dir` and the
prepared disposable MetaMask profile's absolute path. Restart the MCP connection after changing
its configuration and check for `local-vault: Chromium Network.enable post-data cap applied` in
its startup log. Keep one browser owner. MetaMask may require a manual unlock after restart.
Local agent session records and disposable test credentials belong in the ignored `.local-vault/`
directory, with credential files restricted to their owner. Keep credentials out of committed files.

## Shared presentation

The app uses a light semantic theme and Radix Nova components. The [design-system contract](docs/design-system.md) explains theme roles, shared variants, layout recipes, exact exceptions and verification. The [upgrade provenance](docs/design-system-upstream.json) records the current official source hashes and resolved UI dependencies. Install development dependencies before compiling, as the theme imports the project-pinned shadcn CSS.

## Code quality

The checks follow midnight-integration-dev's TypeScript, import, documentation, formatting and test
policy, with Next.js, React Hooks, accessibility and the shared design checks added for this app.
TypeScript source and tests receive type-aware lint. JavaScript tools receive basic JavaScript lint.
Export documentation applies to application source. Markdown and YAML retain their manual layout.

Run the everyday aggregate with the project's configured Yarn version:

```bash
yarn quality
```

It checks formatting, zero-warning lint, TypeScript, the design system and regression tests. The
individual commands remain available for diagnosing a failure:

```bash
yarn format
yarn lint
yarn typecheck
yarn quality:design
yarn test
```

Workflow syntax and security validation are separate from this everyday command. CI provisions
pinned actionlint and zizmor and runs workflow validation with read-only GitHub metadata access.
The aggregate does not run a production build or a funded browser transaction.

Clipboard copying requires HTTPS or localhost and browser permission. Copy controls report unavailable
access or permission rejection. Vault proofs use the applied application proof-server setting. The
Midnight connector's deprecated informational prover URL is not read.

The everyday test gate uses small controlled proving assets with the real SDK verifier.
