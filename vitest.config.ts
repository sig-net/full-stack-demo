import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { readZkManifestHashes } from "./scripts/zk-manifest-hashes.ts";

const zkManifestHashes = readZkManifestHashes();

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    env: {
      VAULT_ZK_MANIFEST_SHA256: zkManifestHashes.vault,
      SIGNET_ZK_MANIFEST_SHA256: zkManifestHashes.signet,
    },
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/components/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
          exclude: ["tests/components/**"],
        },
      },
    ],
    passWithNoTests: false,
    restoreMocks: true,
    clearMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
