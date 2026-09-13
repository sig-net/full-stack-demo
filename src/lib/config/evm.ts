import { sepolia } from "viem/chains";
import { z } from "zod";

import { isLoopbackEndpoint } from "./loopback-endpoint";

export { sepolia };

/** Validated public RPC inputs shared by browser clients and server operation handlers. */
export interface EvmChainConfig {
  readonly chainId: typeof sepolia.id;
  readonly rpcUrl: string;
  readonly explorerUrl?: string;
}

/**
 * Captures an immutable RPC selection, omitting public explorer links for loopback endpoints.
 *
 * @param rpcUrl - An HTTP(S) endpoint, or undefined for the local Anvil default.
 * @returns A Sepolia configuration for the selected endpoint.
 * @throws {Error} If the supplied endpoint is not an absolute HTTP(S) URL.
 */
export function createEvmChainConfig(rpcUrl: string | undefined): EvmChainConfig {
  const parsed = z
    .url({
      protocol: /^https?$/,
      error: "NEXT_PUBLIC_SEPOLIA_RPC_URL must be an absolute HTTP(S) URL",
    })
    .safeParse(rpcUrl ?? "http://127.0.0.1:8545");
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    throw new Error(issue ? issue.message : parsed.error.message);
  }
  return Object.freeze({
    chainId: sepolia.id,
    rpcUrl: parsed.data,
    explorerUrl: isLoopbackEndpoint(new URL(parsed.data).origin)
      ? undefined
      : sepolia.blockExplorers.default.url,
  });
}

/**
 * Reads the statically exposed Next.js RPC environment value at the call boundary.
 *
 * @returns The validated startup EVM configuration.
 * @throws {Error} If the configured RPC endpoint is invalid.
 */
export function getEvmChainConfig(): EvmChainConfig {
  return createEvmChainConfig(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL);
}
