# Production image for the Token Manager UI: the Next.js standalone server plus the vault and
# Signet zk asset trees served from /zk, matching local development. Every instruction stays
# within what the legacy builder supports (architecture comes from uname), so the image builds
# with and without BuildKit.

ARG NODE_IMAGE=node:24.18.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
# The pinned project Yarn launcher, the same download and checksum the quality workflow uses.
RUN curl --proto '=https' --tlsv1.2 -fsSL --retry 4 \
        https://repo.yarnpkg.com/4.18.0/packages/yarnpkg-cli/bin/yarn.js \
        -o /opt/yarn.cjs \
    && echo 'fb8b1d20be72a0b544a35bcec4c7ed0ff55a9b173c01f191b02ba164b2051db5  /opt/yarn.cjs' | sha256sum -c \
    && printf '#!/bin/sh\nexec node /opt/yarn.cjs "$@"\n' > /usr/local/bin/yarn \
    && chmod +x /usr/local/bin/yarn

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# Regenerates the vault prover keys with the Compact release the installed vault package pins.
# erc20-vault-zk-assets refuses any other release, so these versions and checksums move together
# with @sig-net/midnight-examples-erc20-vault-contract in package.json.
FROM deps AS zk-assets
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip xz-utils \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    launcher=compact-v0.5.1; \
    compiler=0.33.0-rc.2; \
    arch="$(uname -m)"; \
    case "$arch" in \
        aarch64) \
            launcher_sha256=bbeb53b34c895aa52e13a6375cbfe90bd670b2e6a72ba23356d383664a9536cf; \
            compiler_sha256=3aa23812b0b086dbce07da3931a40dcb01bec9676b1ceed7f2d0be370ab2dc46;; \
        x86_64) \
            launcher_sha256=684c6b3d2eef9484aabba7a0820c166ae5c169f3aecf28cbea2074840263ba66; \
            compiler_sha256=3055ab92bbc8d5bb0d6282b661b83761d2a0de2ee37e21cf7107e25aaf2a9aad;; \
        *) echo "No Compact toolchain build for $arch" >&2; exit 1;; \
    esac; \
    triple="${arch}-unknown-linux-musl"; \
    curl --proto '=https' --tlsv1.2 -fsSL --retry 4 -o /tmp/compact.tar.xz \
        "https://github.com/midnightntwrk/compact/releases/download/${launcher}/compact-${triple}.tar.xz"; \
    echo "${launcher_sha256}  /tmp/compact.tar.xz" | sha256sum -c; \
    tar -xJf /tmp/compact.tar.xz -C /usr/local/bin --strip-components=1 "compact-${triple}/compact"; \
    versions="$HOME/.compact/versions/${compiler}/${triple}"; \
    mkdir -p "$versions" "$HOME/.compact/bin"; \
    curl --proto '=https' --tlsv1.2 -fsSL --retry 4 -o /tmp/compactc.zip \
        "https://github.com/LFDT-Minokawa/compact/releases/download/compactc-v${compiler}/compactc_v${compiler}_${triple}.zip"; \
    echo "${compiler_sha256}  /tmp/compactc.zip" | sha256sum -c; \
    unzip -qo /tmp/compactc.zip -d "$versions"; \
    chmod +x "$versions"/*; \
    rm /tmp/compact.tar.xz /tmp/compactc.zip; \
    compact update "$compiler" || ln -sfn "$versions"/* "$HOME/.compact/bin/"; \
    compact compile "+${compiler}" --version
COPY scripts/prepare-zk-assets.mjs scripts/
COPY src/lib/midnight/zk-manifest-hashes.ts src/lib/midnight/
RUN yarn zk-assets

# Next.js inlines NEXT_PUBLIC_ values into the browser bundle at build time. Pass the deployment's
# public configuration as build arguments. Unset arguments leave the application defaults in
# place, which select the undeployed network on loopback endpoints.
FROM deps AS build
ARG NEXT_PUBLIC_MIDNIGHT_NETWORK_ID
ARG NEXT_PUBLIC_SEPOLIA_RPC_URL
ARG NEXT_PUBLIC_MIDNIGHT_NODE_URL
ARG NEXT_PUBLIC_MIDNIGHT_INDEXER_URL
ARG NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL
ARG NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL
ARG NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS
ARG NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS
ARG NEXT_PUBLIC_MPC_SECP256K1_PUBKEY
ARG NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS
ARG NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE
ARG NEXT_PUBLIC_ZK_CONFIG_ORIGIN
COPY . .
RUN yarn build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=zk-assets --chown=node:node /app/public/zk ./public/zk
USER node
EXPOSE 3000
CMD ["node", "server.js"]
