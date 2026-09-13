import { createPublicClient, http, type PublicClient } from "viem";

import type { EvmChainConfig } from "@/lib/config/evm";
import { sepolia } from "@/lib/config/evm";

/**
 * Constructs an HTTP client owned by the caller for its captured chain and endpoint.
 *
 * @param config - Validated Sepolia configuration.
 * @returns A public client scoped to those endpoint inputs.
 */
export function getEthereumProvider(config: EvmChainConfig): PublicClient {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.rpcUrl),
  });
  return client;
}
