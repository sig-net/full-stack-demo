"use client";

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import {
  type RuntimeConfig,
  runtimeConfigurationSchema,
  runtimeFingerprint,
} from "@/lib/config/runtime";
import type { ServerRuntimeConfiguration } from "@/lib/config/server-runtime";
import { useRuntimeConfiguration } from "@/providers/runtime-config-context";

const queryKey = ["server-runtime-configuration", 2] as const;

function differencesBetween(browser: RuntimeConfig, server: RuntimeConfig): string[] {
  const comparisons: readonly [string, unknown, unknown][] = [
    ["Midnight network", browser.midnight.networkId, server.midnight.networkId],
    ["Indexer URL", browser.midnight.indexerUrl, server.midnight.indexerUrl],
    ["Indexer WebSocket URL", browser.midnight.indexerWsUrl, server.midnight.indexerWsUrl],
    ["Node URL", browser.midnight.nodeUrl, server.midnight.nodeUrl],
    ["Proof server URL", browser.midnight.proofServerUrl, server.midnight.proofServerUrl],
    ["EVM chain", browser.evm.chainId, server.evm.chainId],
    ["EVM RPC URL", browser.evm.rpcUrl, server.evm.rpcUrl],
    ["Vault contract address", browser.vault.contractAddress, server.vault.contractAddress],
    [
      "Signet contract address",
      browser.vault.signetContractAddress,
      server.vault.signetContractAddress,
    ],
    ["MPC public key", browser.vault.mpcPubkey, server.vault.mpcPubkey],
  ];
  return comparisons
    .filter(([, browserValue, serverValue]) => browserValue !== serverValue)
    .map(([label]) => label);
}

async function fetchServerConfiguration(): Promise<ServerRuntimeConfiguration> {
  const response = await fetch("/api/runtime-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Server deployment configuration is unavailable.");
  const input: unknown = await response.json();
  if (
    typeof input !== "object" ||
    input === null ||
    !("config" in input) ||
    !("fingerprint" in input)
  )
    throw new Error("Server configuration response is invalid.");
  const config = runtimeConfigurationSchema.parse(input.config);
  const fingerprint = runtimeFingerprint(config);
  if (fingerprint !== input.fingerprint)
    throw new Error("Server configuration verification failed.");
  return { config, fingerprint };
}

/**
 * @returns Server compatibility and a header guard that rechecks current owner and query state.
 */
export function useServerRuntimeCompatibility(): {
  differences: string[];
  serverUnavailable: string | null;
  requireServerHeaders: () => Record<string, string>;
  server: UseQueryResult<ServerRuntimeConfiguration>;
} {
  const { owner, applied } = useRuntimeConfiguration();
  const queryClient = useQueryClient();
  const server = useQuery({
    queryKey,
    queryFn: fetchServerConfiguration,
    retry: false,
    refetchInterval: 30_000,
  });
  const differences = server.data ? differencesBetween(applied, server.data.config) : [];
  const serverUnavailable =
    server.isError || !server.data
      ? "Server deployment compatibility is unavailable. Independent wallet actions remain available."
      : differences.length
        ? `Server-assisted actions are unavailable: ${differences.join(", ")} differ from the server.`
        : null;
  const requireServerHeaders = (): Record<string, string> => {
    const currentQuery =
      queryClient.getQueryState<Awaited<ReturnType<typeof fetchServerConfiguration>>>(queryKey);
    if (serverUnavailable || !server.data || currentQuery?.status !== "success")
      throw new Error(serverUnavailable ?? "Server deployment compatibility is unavailable.");
    if (
      owner.getSnapshot().applied.fingerprint !== applied.fingerprint ||
      currentQuery.data?.fingerprint !== applied.fingerprint
    )
      throw new Error("Configuration changed. Retry the action.");
    return { "x-vault-configuration": applied.fingerprint };
  };
  return { differences, serverUnavailable, requireServerHeaders, server };
}
