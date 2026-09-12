import { sepolia } from 'viem/chains';
import { isLoopbackEndpoint } from './loopback-endpoint';

export { sepolia };
import { z } from 'zod';

export interface EvmChainConfig {
  readonly chainId: typeof sepolia.id;
  readonly rpcUrl: string;
  readonly explorerUrl?: string;
}

export function createEvmChainConfig(
  rpcUrl: string | undefined,
): EvmChainConfig {
  const parsed = z
    .url({
      protocol: /^https?$/,
      error: 'NEXT_PUBLIC_SEPOLIA_RPC_URL must be an absolute HTTP(S) URL',
    })
    .safeParse(rpcUrl ?? 'http://127.0.0.1:8545');
  if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
  return Object.freeze({
    chainId: sepolia.id,
    rpcUrl: parsed.data,
    explorerUrl: isLoopbackEndpoint(new URL(parsed.data).origin)
      ? undefined
      : sepolia.blockExplorers.default.url,
  });
}

export function getEvmChainConfig(): EvmChainConfig {
  return createEvmChainConfig(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL);
}
