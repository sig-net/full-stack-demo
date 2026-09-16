import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** One served proving tree: its child path under the asset origin and the installed manifest. */
export interface ZkManifestSource {
  readonly child: "" | "signet";
  readonly manifestUrl: string;
}

/**
 * @param specifier - Package export of a shipped manifest.
 * @returns Its `file:` URL. The compiled next.config.ts resolves to a plain path instead.
 */
function manifestUrl(specifier: string): string {
  const resolved = import.meta.resolve(specifier);
  return resolved.startsWith("file:") ? resolved : pathToFileURL(resolved).href;
}

/** The vault tree at the origin root and the Signet callee tree under `signet/`. */
export const ZK_MANIFEST_SOURCES: readonly ZkManifestSource[] = [
  {
    child: "",
    manifestUrl: manifestUrl(
      "@sig-net/midnight-examples-erc20-vault-contract/managed/erc20-vault/compiler/contract-manifest.json",
    ),
  },
  {
    child: "signet",
    manifestUrl: manifestUrl("@sig-net/midnight-contract/managed/compiler/contract-manifest.json"),
  },
];

/** SHA-256 of each installed contract package's `compiler/contract-manifest.json`. */
export interface ZkManifestHashes {
  readonly vault: string;
  readonly signet: string;
}

/**
 * Hashes the manifests of the installed contract packages, so the browser pin, the asset
 * preparation and the tests all certify the same compiled contracts.
 *
 * @returns Lower-case hexadecimal SHA-256 of the vault and Signet manifests.
 * @throws {Error} If an installed package does not ship its manifest.
 */
export function readZkManifestHashes(): ZkManifestHashes {
  const hashes = ZK_MANIFEST_SOURCES.map(({ manifestUrl }) =>
    createHash("sha256")
      .update(readFileSync(new URL(manifestUrl)))
      .digest("hex"),
  );
  const [vault, signet] = hashes;
  if (!vault || !signet) throw new Error("Both contract package manifests are required.");
  return { vault, signet };
}
