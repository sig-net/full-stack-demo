import type { NextConfig } from "next";

import { readZkManifestHashes } from "./scripts/zk-manifest-hashes.ts";

const zkManifestHashes = readZkManifestHashes();

const nextConfig: NextConfig = {
  // The browser refuses a proving-asset origin whose manifest differs from these pins, so they
  // are inlined from the installed contract packages rather than read from the origin.
  env: {
    VAULT_ZK_MANIFEST_SHA256: zkManifestHashes.vault,
    SIGNET_ZK_MANIFEST_SHA256: zkManifestHashes.signet,
  },

  // Enable React Compiler for automatic memoization
  reactCompiler: true,

  // Skip TypeScript errors during build (use separate tsc check)
  typescript: {
    ignoreBuildErrors: true,
  },

  reactStrictMode: true,

  // The Dockerfile runs the traced server at .next/standalone/server.js
  output: "standalone",

  // The deploy package locates the signet contract's zk assets with a module-level
  // createRequire(...).resolve(), which a bundled build turns into a module id and breaks.
  // Node loads it from node_modules at runtime instead.
  serverExternalPackages: ["@sig-net/midnight-contract-deploy"],

  // Optimize package imports
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@tanstack/react-query",
      "@web3icons/react",
    ],
  },

  turbopack: {
    resolveAlias: {
      // Midnight packages import a named `WebSocket`. The browser build of
      // isomorphic-ws only default-exports. The shim provides both.
      "isomorphic-ws": "./src/lib/midnight/shims/isomorphic-ws.ts",
    },
  },
};

export default nextConfig;
