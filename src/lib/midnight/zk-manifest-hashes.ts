// The zk config providers refuse an asset origin whose compiler/contract-manifest.json hashes
// differently from these pins, so the origin cannot certify its own replacement. next.config.ts
// inlines both values from the installed contract packages at build time, and vitest.config.ts
// sets them for tests. The values are read by scripts/zk-manifest-hashes.ts.

/**
 * @param name - Environment name of the pin, for the failure message.
 * @param value - The inlined value.
 * @returns The pin.
 * @throws {Error} If the bundle was built without a SHA-256 pin under that name.
 */
function pinned(name: string, value: string | undefined): string {
  if (value === undefined || !/^[a-f0-9]{64}$/.test(value))
    throw new Error(
      `${name} is not a SHA-256 manifest pin. Build through next.config.ts, which inlines it from the installed contract package.`,
    );
  return value;
}

/** `<origin>/compiler/contract-manifest.json`: the vault's circuits. */
export const VAULT_ZK_MANIFEST_SHA256 = pinned(
  "VAULT_ZK_MANIFEST_SHA256",
  process.env.VAULT_ZK_MANIFEST_SHA256,
);

/** `<origin>/signet/compiler/contract-manifest.json`: the signet contract the vault calls. */
export const SIGNET_ZK_MANIFEST_SHA256 = pinned(
  "SIGNET_ZK_MANIFEST_SHA256",
  process.env.SIGNET_ZK_MANIFEST_SHA256,
);
