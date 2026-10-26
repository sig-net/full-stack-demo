# Production image for the demo: the Next.js server, its production dependencies, every
# contract's prover keys and ZKIR under /app/zk-assets, the default MIDNIGHT_ZK_ASSETS_ROOT, the
# vault's bundle again under /app/public/zk-assets for the browser, and
# the database migration, which `node scripts/migrate.ts` applies before the server starts.
# Every instruction stays within what the legacy builder supports (architecture comes from uname),
# so the image builds with and without BuildKit.
# All configuration, public and server-only alike, is read from the runtime environment
# (.env.example lists it), so the image is the same for every deployment.

ARG NODE_IMAGE=node:24.18.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
# The Yarn release package.json pins, verified by checksum.
RUN curl --proto '=https' --tlsv1.2 -fsSL --retry 4 \
        https://repo.yarnpkg.com/4.18.0/packages/yarnpkg-cli/bin/yarn.js \
        -o /opt/yarn.cjs \
    && echo 'fb8b1d20be72a0b544a35bcec4c7ed0ff55a9b173c01f191b02ba164b2051db5  /opt/yarn.cjs' | sha256sum -c \
    && printf '#!/bin/sh\nexec node /opt/yarn.cjs "$@"\n' > /usr/local/bin/yarn \
    && chmod +x /usr/local/bin/yarn

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM deps AS production-deps
RUN yarn workspaces focus --all --production \
    && rm -rf .yarn/cache

# Regenerates the prover keys with the Compact release the installed vault package pins.
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
RUN yarn zk-assets

FROM deps AS build
COPY . .
RUN yarn build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=zk-assets --chown=node:node /app/zk-assets ./zk-assets
# The browser fetches the vault's bundle from the page's origin, where `yarn zk-assets:public` puts it.
COPY --from=zk-assets --chown=node:node /app/zk-assets/ethereum-erc20-vault ./public/zk-assets/ethereum-erc20-vault
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts/migrate.ts ./scripts/migrate.ts
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
