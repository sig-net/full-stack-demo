import { type Chain, defineChain } from "viem";
import * as chains from "viem/chains";
import { mainnet, sepolia } from "viem/chains";
import { z } from "zod";

import { isLoopbackEndpoint } from "./loopback-endpoint";
import type { NetworkId } from "./midnight";

export { sepolia };

/** Explicit EVM environments available in the configuration selector. */
export const EVM_NETWORKS = ["local", "sepolia", "mainnet"] as const;
/** Selected default and chain-discovery policy for an EVM configuration. */
export type EvmNetwork = (typeof EVM_NETWORKS)[number];

/**
 * @param network - Selected EVM environment.
 * @returns Explicit network defaults, with local chain discovery pending.
 */
export function getEvmNetworkDefaults(network: EvmNetwork): EvmChainConfig {
  // Publicnode endpoints passed browser-origin RPC reads. Retire these overrides when dependency defaults pass the same check.
  switch (network) {
    case "local":
      return { network, chainId: null, rpcUrl: "http://127.0.0.1:8545", explorerUrl: "" };
    case "sepolia":
      return {
        network,
        chainId: BigInt(sepolia.id),
        rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
        explorerUrl: sepolia.blockExplorers.default.url,
      };
    case "mainnet":
      return {
        network,
        chainId: BigInt(mainnet.id),
        rpcUrl: "https://ethereum-rpc.publicnode.com",
        explorerUrl: mainnet.blockExplorers.default.url,
      };
  }
}

/**
 * @param network - Selected Midnight environment.
 * @returns Its initial EVM environment.
 */
export function evmNetworkForMidnight(network: NetworkId): EvmNetwork {
  switch (network) {
    case "undeployed":
      return "local";
    case "mainnet":
      return "mainnet";
    case "stagenet":
    case "preview":
    case "preprod":
      return "sepolia";
  }
}

/** Nullable chain and empty endpoints represent an unapplied connection. */
export interface EvmChainConfig {
  readonly network: EvmNetwork;
  readonly chainId: bigint | null;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
}

/** Connection inputs include a chain representable by number-based wallet APIs. */
export interface ResolvedEvmChainConfig extends EvmChainConfig {
  readonly chainId: bigint;
  readonly chain: Chain;
}

/**
 * @param chainId - Positive EVM chain identifier.
 * @returns The installed chain definition, if published by viem.
 */
export function knownEvmChain(chainId: bigint): Chain | undefined {
  return Object.values(chains).find((chain) => BigInt(chain.id) === chainId);
}

/**
 * @param config - Current applied values.
 * @param chainId - Selected chain or null to clear all EVM fields.
 * @returns The chain override with captured endpoints preserved, or cleared fields for null.
 * @throws {Error} If the chain ID is not positive.
 */
export function selectEvmChain(config: EvmChainConfig, chainId: bigint | null): EvmChainConfig {
  if (chainId === null) return { ...config, chainId, rpcUrl: "", explorerUrl: "" };
  if (chainId === config.chainId) return config;
  if (chainId <= 0n) throw new Error("Enter a positive chain ID representable by the wallet API.");
  return { ...config, chainId };
}

/**
 * @param config - Candidate wallet connection inputs.
 * @returns A number-safe chain definition paired with its captured RPC.
 * @throws {Error} If chain ID or RPC inputs cannot construct a wallet.
 */
export function resolveEvmChain(config: EvmChainConfig): ResolvedEvmChainConfig {
  if (
    config.chainId === null ||
    config.chainId <= 0n ||
    config.chainId > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new Error("Configure a positive EVM chain ID representable by the wallet API.");
  if (!z.url({ protocol: /^https?$/ }).safeParse(config.rpcUrl).success)
    throw new Error("Configure an absolute HTTP(S) EVM RPC URL.");
  const chain =
    knownEvmChain(config.chainId) ??
    defineChain({
      id: Number(config.chainId),
      name: `EVM ${config.chainId.toString()}`,
      nativeCurrency: { name: "Native currency", symbol: "NATIVE", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });
  return { ...config, chainId: config.chainId, chain };
}

/**
 * @param rpcUrl - Explicit server Sepolia RPC or the local Anvil default.
 * @returns Validated server chain inputs with local explorer links disabled.
 */
export function createEvmChainConfig(rpcUrl: string | undefined): EvmChainConfig {
  const parsed = z.url({ protocol: /^https?$/ }).parse(rpcUrl ?? "http://127.0.0.1:8545");
  return Object.freeze({
    network: isLoopbackEndpoint(parsed) ? "local" : "sepolia",
    chainId: BigInt(sepolia.id),
    rpcUrl: parsed,
    explorerUrl: isLoopbackEndpoint(parsed) ? "" : sepolia.blockExplorers.default.url,
  });
}

/**
 * @returns The server startup Sepolia configuration from its public RPC environment input.
 */
export function getEvmChainConfig(): EvmChainConfig {
  return createEvmChainConfig(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL);
}

/**
 * @param config - Captured network selection and explicit chain override.
 * @returns Whether the RPC must report its chain before this configuration is used.
 */
export function requiresRpcChainVerification(config: EvmChainConfig): boolean {
  return (
    config.network === "local" || config.chainId !== getEvmNetworkDefaults(config.network).chainId
  );
}
