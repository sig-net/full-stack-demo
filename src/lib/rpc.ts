import { createPublicClient, http, type PublicClient } from "viem";

import { type EvmChainConfig, resolveEvmChain } from "@/lib/config/runtime";

/**
 * Constructs an HTTP client owned by the caller for its captured chain and endpoint.
 *
 * @param config - Captured EVM chain and endpoint inputs.
 * @returns A public client scoped to those endpoint inputs.
 */
export function getEthereumProvider(config: EvmChainConfig): PublicClient {
  const client = createPublicClient({
    chain: resolveEvmChain(config).chain,
    transport: http(config.rpcUrl),
  });
  return client;
}
