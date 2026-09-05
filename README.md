# full-stack-demo

A demo web app for a **shielded ERC-20 vault**: deposit, withdraw, and swap ERC-20 tokens through
a Midnight contract, with the EVM side executed on Sepolia and signed by an MPC responder. The UI
is chain-agnostic — connect the **Developer (Midnight)** wallet, or a Solana wallet.

It's a Next.js app. The heavy pieces (the MPC responder + its proof server) are already deployed,
and the ZK prover keys are hosted on object storage, so you only need to run the web app locally
plus your own **local Midnight proof server**.

## How it fits together

- **This app (Next.js)** — the UI + a few serverless routes (gas top-up relayer, tx tracking).
- **Local proof server** — you run it; it proves the vault circuits for your session. The circuits
  are large, which is why each user runs their own rather than sharing a hosted one.
- **ZK prover keys**: fetched at runtime from `NEXT_PUBLIC_ZK_CONFIG_ORIGIN` (object storage), or
  from this app's own `public/zk` folder in local development (see [ZK assets](#zk-assets)).
- **Contracts**: the vault and signet contract addresses of the selected network come from the
  npm packages `@sig-net/midnight-examples-erc20-vault-contract` and `@sig-net/midnight`, keyed by
  `NEXT_PUBLIC_MIDNIGHT_NETWORK_ID`.
- **MPC responder (fakenet) + its proof server** — deployed; signs the Sepolia txs and posts the
  attestations the app reads back. Configured via `NEXT_PUBLIC_FAKENET_RESPONSES_URL`.
- **Networks** — Midnight **stagenet** and Ethereum **Sepolia** (both public testnets).

## Prerequisites

- Node 20+ and [Yarn](https://yarnpkg.com) (enabled via `corepack enable`)
- Docker (for the local proof server)
- The Compact toolchain (the `compact` launcher) with compiler
  `0.33.0-rc.2` installed (`compact update 0.33.0-rc.2`), only if you regenerate the ZK assets
  locally (see [ZK assets](#zk-assets))
- A Sepolia RPC key (free from [Infura](https://infura.io) or [Alchemy](https://alchemy.com))
- A little Sepolia ETH in a relayer wallet (it pays users' gas)

## Setup

```bash
yarn install
cp .env.example .env.local
# fill in the secrets at the bottom of .env.local (Sepolia RPC key, relayer key, wallet seed)
```

Start your local proof server (leave it running):

```bash
docker run -p 6300:6300 midnightntwrk/proof-server:9.0.0-rc.5_experimental \
  midnight-proof-server -v
```

Run the app:

```bash
yarn dev
```

Open http://localhost:3000, connect the **Developer (Midnight)** wallet, and deposit / swap.

## ZK assets

Proving needs the prover keys, verifier keys and ZKIR of every vault circuit plus those of the
signet contract the vault calls. The vault package ships everything except the prover keys
(1.4 GB across 17 circuits), so they are regenerated locally with the pinned Compact compiler:

```bash
yarn zk-assets
```

The first run compiles the vault (about ten minutes) and lays out:

```text
public/zk/keys/<circuit>.prover, <circuit>.verifier     the vault's 17 circuits
public/zk/zkir/<circuit>.bzkir
public/zk/compiler/contract-manifest.json, contract-info.json
public/zk/signet/{keys,zkir,compiler}/...                the signet contract, copied from @sig-net/midnight-contract
```

A rerun verifies what is there against the packages' manifests and skips a tree that already
matches. `--force` rebuilds, `--signet-only` skips the compiler, `--vault-only` skips the copy.
The run ends by printing each tree's `compiler/contract-manifest.json` sha256. Those two values
are pinned in `lib/midnight/zk-manifest-hashes.ts`, so update that file whenever they change.

With `NEXT_PUBLIC_ZK_CONFIG_ORIGIN` unset the app fetches these files from its own `/zk` path. For a
deployment, upload the contents of `public/zk` to the object store, point
`NEXT_PUBLIC_ZK_CONFIG_ORIGIN` at the URL that tree is served from, and upload again after every
vault or signet release: the manifest hashes change with the contract.

## Notes

- **Proving is heavy** — the first deposit/swap downloads the prover keys (hundreds of MB) and
  proves locally; give it a minute. Subsequent ops reuse the cached keys.
- **Swap** is exact-output on-chain: you enter what you want to spend, receive at least the quoted
  output, and any unspent input is refunded as change.
- The `.env.local` you create is git-ignored — never commit secrets.
