import { createPublicClient, http, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';

import { getClientEnv } from '@/lib/config/env.config';

let cachedEthereumProvider: PublicClient | null = null;

export function getEthereumProvider(): PublicClient {
  if (cachedEthereumProvider) {
    return cachedEthereumProvider;
  }
  cachedEthereumProvider = createPublicClient({
    chain: sepolia,
    transport: http(getEthSepoliaRpcUrl()),
  });
  return cachedEthereumProvider;
}

// The single Sepolia JSON-RPC endpoint (any provider) used by all EVM paths.
export function getEthSepoliaRpcUrl(): string {
  return getClientEnv().NEXT_PUBLIC_SEPOLIA_RPC_URL;
}
