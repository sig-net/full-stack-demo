import { createPublicClient, http, type PublicClient } from "viem";

import type { EvmChainConfig } from "@/lib/config/evm";
import { sepolia } from "@/lib/config/evm";

const ethereumProviders = new Map<string, PublicClient>();

/**
 * Reuses public RPC clients for the same captured chain and endpoint pair.
 *
 * @param config - Validated Sepolia configuration.
 * @returns The public client associated with those endpoint inputs.
 */
export function getEthereumProvider(config: EvmChainConfig): PublicClient {
  const key = `${config.chainId.toString()}:${config.rpcUrl}`;
  const cached = ethereumProviders.get(key);
  if (cached) return cached;
  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.rpcUrl),
  });
  ethereumProviders.set(key, client);
  return client;
}
