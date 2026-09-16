import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, it, vi } from "vitest";

import { readZkManifestHashes, ZK_MANIFEST_SOURCES } from "../../scripts/zk-manifest-hashes.ts";

it("pins the browser to the installed contract manifests and rejects a bundle without pins", async () => {
  expect(ZK_MANIFEST_SOURCES).toHaveLength(2);
  const hashes = readZkManifestHashes();
  for (const [source, hash] of [
    [ZK_MANIFEST_SOURCES[0], hashes.vault],
    [ZK_MANIFEST_SOURCES[1], hashes.signet],
  ] as const) {
    if (!source) throw new Error("Both manifest sources are required.");
    const bytes = await readFile(new URL(source.manifestUrl));
    expect(bytes.length).toBeGreaterThan(0);
    expect(hash).toBe(createHash("sha256").update(bytes).digest("hex"));
  }
  const pins = await import("@/lib/midnight/zk-manifest-hashes");
  expect(pins.VAULT_ZK_MANIFEST_SHA256).toBe(hashes.vault);
  expect(pins.SIGNET_ZK_MANIFEST_SHA256).toBe(hashes.signet);
  vi.stubEnv("VAULT_ZK_MANIFEST_SHA256", "not-a-pin");
  vi.resetModules();
  await expect(import("@/lib/midnight/zk-manifest-hashes")).rejects.toThrow(
    "VAULT_ZK_MANIFEST_SHA256 is not a SHA-256 manifest pin",
  );
});
