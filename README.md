# Local shielded ERC-20 vault demo

Run the UI against a local Midnight stack and an Anvil fork of Sepolia. The examples setup deploys Signet and the vault, initialises the vault, funds setup roles, starts fakenet and generates the UI configuration. The upstream Sepolia RPC URL belongs only to Anvil. Browser, backend and responder transactions use the local fork.

## Prerequisites

Use Node 24, Yarn, Docker with Compose, and the Compact launcher with compiler `0.33.0-rc.2` available. The compiler reports `0.33.0`, with language `0.25.0` and runtime `0.18.0-rc.1`. Proving and the first compilation are substantial local workloads. Keep the proof server running throughout setup and use.

The companion examples checkout must contain the local setup changes on [codex/erc20-vault-local-setup](https://github.com/sig-net/midnight-examples/tree/codex/erc20-vault-local-setup), published at commit `5c3b578` and based on `ad30bf8dbb5642945aa13ec0f54840c5e76449c0`. The UI uses vault release `0.1.0` and Signet SDK `0.21.0`. Setup checks the source and compiled artefacts against the UI's installed release before deploying. On another machine, clone the examples repository and check out that branch. The commands below use the local worktree at `/Users/bernard/Projects/github.com/sig-net/midnight-examples-setup-script`. Adjust checkout paths for your machine.

The only required environment input is `SEPOLIA_FORK_RPC_URL` in the examples checkout's private `.env`. Supply an upstream Sepolia HTTP(S) RPC URL there. Keep this file private and leave it available while Anvil runs. Setup generates independent role seeds, a relayer key and testing user credentials.

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

| Output | Purpose |
| --- | --- |
| UI `.env.local` | Public endpoints, deployment addresses, MPC key and fork marker, plus server-only genesis and relayer credentials |
| Examples `.local-demo/testing-user.env` | Optional testing wallet seed and independent vault caller secret |
| Examples `.local-demo/setup.env` | Private resumable setup state |
| Examples `.local-demo/instance.json` | Local Anvil instance and marker identity |

Generated credential files use mode 0600. Setup refuses to overwrite a UI `.env.local` without its generated-file header. Move or reconcile a manually maintained file first. Never copy server credentials into `NEXT_PUBLIC_` variables. Testing credentials are for optional manual entry and are not restored into the browser automatically.

## Prepare assets and start the UI

From this UI checkout:

```bash
yarn zk-assets
yarn dev
```

The asset command verifies complete vault and Signet trees in staging before replacing `public/zk`. The vault uses `/zk/{keys,zkir,compiler}` and Signet uses `/zk/signet/{keys,zkir,compiler}`. A failed or incomplete preparation preserves the serving tree. The package manifests and browser-pinned hashes must agree. `NEXT_PUBLIC_ZK_CONFIG_ORIGIN` defaults to this app's `/zk` URL.

Open [the local app](http://localhost:3000). Connect a Midnight seed wallet with a fresh hexadecimal seed, or manually paste the testing seed from the private output. Wallet synchronisation completes even when the fresh wallet has no funds. Select or generate a separate 32-byte vault identity. Keep that secret outside the app if you want to return to the same identity.

For an EVM extension, configure a local network with RPC `http://127.0.0.1:8545`, chain ID `11155111`, and ETH as its currency. Select this local network before connecting. Public Sepolia shares that chain ID, so the app also checks the generated fork marker through the extension. A public Sepolia connection cannot pass that local marker check. Local transaction hashes remain visible without links to a public explorer.

Choose **Fund local wallets** for the connected wallets, then wait for registration and balance refresh. Local funding targets 1 ETH, 100 USDC using on-chain decimals, and 1,000,000,000,000 NIGHT base units. Repeated requests transfer only a deficit and preserve balances above target. Midnight funding sends the public NIGHT address and verifying key. DUST registration is signed by the browser wallet. The user seed and vault secret stay in page memory.

Readiness requires measured balances of at least 0.01 ETH, 1 USDC and 10 DUST. One DUST equals 1,000,000,000,000,000 SPECK. The DUST reserve is a conservative aggregate allowance. The final deposit transaction budget remains subject to the end-to-end deposit check. Unknown balances require refresh and cannot unlock a transaction.

## Deposit and recovery

In **Deposit**, select USDC and enter `0.1`. Approve the EVM transfer in the extension. After confirmation, choose the explicit Midnight continuation to sweep the displayed deposit address into the shielded vault. Preserve the destination and transaction hash when troubleshooting. A failed continuation can resume from the confirmed transfer without sending again. A manual continuation is available for a transfer made outside the app.

Wallet connection, vault identity, binding and balances have separate readiness states. **Retry vault** retries binding. **Retry balances** or **Refresh balances** retries reads. Disconnect forgets the wallet seed and retains the selected identity in page memory. Refresh clears both. Wallet replacement cannot adopt the result of an older session's funding or transaction.

Withdraw, swap, supply and redeem use the MPC path independently of the EVM extension. One shared operation runs at a time. Activity distinguishes success, refund and failure. A failed balance refresh after settlement does not turn settlement into failure. EVM output is reconstructed from the configured fork's executed transaction and checked against the on-chain response attestation before settlement.

## Reuse and reset

Rerun the setup command with the same live stack to reuse its addresses and private role configuration. A setup lock prevents concurrent runs. Remove `.local-demo/setup.lock` only after confirming an interrupted process has stopped. Asset preparation has a separate `public/zk.prepare.lock` with the same recovery rule.

Setup rejects a changed Anvil instance or missing Midnight contracts. After intentionally resetting the owned local chain, run:

```bash
yarn setup-local:erc20-vault --ui-directory /Users/bernard/Projects/github.com/sig-net/full-stack-demo-deployment --reset-config > .local-demo/reset-current.log 2>&1
```

The reset option archives the saved configuration and clears only generated chain-bound values from `.local-demo/setup.env` and the root `.env`. The reset option refuses a still-current stack and conflicts with manually changed saved values. It preserves the upstream URL and role credentials. It also replaces the marker after a Midnight-only reset. Restart Next.js after regenerated configuration. Do not reset or stop services belonging to another checkout.

If setup fails, inspect the private setup log and rerun after resolving the reported prerequisite or service failure. A compiler or release mismatch needs matching installed dependencies. A fork identity error needs reconciled local configuration. A DUST wait needs registration and indexer progress. A transaction submission error requires checking actual chain confirmation before retrying.

## Configuration and checks

`.env.example` lists the local defaults and generated fields. Hosted operation remains configurable through validated EVM and Midnight endpoint overrides and compatible deployment values. Local funding requires development mode, Midnight `undeployed`, loopback services, and matching live Anvil metadata and marker. The operation-specific relayer gas top-up route retains its separate contract and derives its recipient from the vault operation.

Run the required UI checks:

```bash
yarn lint && yarn typecheck
```

Executed validation covered local deployment and reuse, both served asset manifests, actual EVM funding and repeat funding, fresh browser NIGHT funding and signed DUST registration, and the normal funding control reaching DUST ready before vault identity selection. Static checks and isolated rejection, reset and lifecycle tests passed. The final browser deposit and its aggregate fee budget remain a separate end-to-end check.
