import { createPublicClient, http, type PublicClient } from 'viem';
import { sepolia } from '@/lib/config/evm';
import type { EvmChainConfig } from '@/lib/config/evm';

const ethereumProviders = new Map<string, PublicClient>();

export function getEthereumProvider(config: EvmChainConfig): PublicClient {
  const key = `${config.chainId}:${config.rpcUrl}`;
  const cached = ethereumProviders.get(key);
  if (cached) return cached;
  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.rpcUrl),
  });
  ethereumProviders.set(key, client);
  return client;
}
