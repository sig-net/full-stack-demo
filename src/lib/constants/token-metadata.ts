import { erc20Abi, type Hex } from "viem";

import type { EvmChainConfig } from "@/lib/config/evm";
import { queryClient } from "@/lib/query-client";
import { getEthereumProvider } from "@/lib/rpc";

/** Display metadata paired with acquisition guidance and operation eligibility. */
export interface TokenConfig {
  erc20Address: string;
  symbol: string;
  name: string;
  chain: "ethereum" | "midnight";
  /** How to acquire this token on testnet */
  acquireHint?: string;
  /** Direct URL to get this token (faucet, swap page, etc.) */
  faucetUrl?: string;
  /** Hide from the swap widget (e.g. a pool exists but only with dust liquidity) */
  noSwap?: boolean;
}

/** Token contracts offered by the Sepolia vault selectors. */
export const ERC20_TOKENS: TokenConfig[] = [
  {
    erc20Address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    symbol: "USDC",
    name: "USD Coin",
    chain: "ethereum",
    acquireHint: "Get testnet USDC from the Circle faucet.",
    faucetUrl: "https://faucet.circle.com/",
  },
  {
    // Lending must select the Aave reserve token configured in evm-stata.ts.
    erc20Address: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    symbol: "USDC.a",
    name: "USD Coin (Aave)",
    chain: "ethereum",
    acquireHint: "Get Sepolia USDC from the Aave faucet. Circle USDC does not work for lending.",
    faucetUrl: "https://app.aave.com/faucet/",

    noSwap: true,
  },
  {
    // The balance reader enumerates this catalogue, so wrapper shares need an entry.
    erc20Address: "0x8A88124522dbBF1E56352ba3DE1d9F78C143751e",
    symbol: "stataUSDC",
    name: "Staked Aave USDC",
    chain: "ethereum",
    acquireHint: "Received by supplying USDC.a through the Lend widget, not from a faucet.",
    noSwap: true,
  },
  {
    erc20Address: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
    symbol: "EURC",
    name: "Euro Coin",
    chain: "ethereum",
    acquireHint: "Get testnet EURC from the Circle faucet.",
    faucetUrl: "https://faucet.circle.com/",
  },
  {
    erc20Address: "0xB4F1737Af37711e9A5890D9510c9bB60e170CB0D",
    symbol: "DAI",
    name: "Dai",
    chain: "ethereum",
    acquireHint:
      "Swap Sepolia ETH for DAI on CoW Swap. First get Sepolia ETH from a faucet, then swap.",
    faucetUrl: "https://swap.cow.fi/#/11155111/swap/ETH/0xB4F1737Af37711e9A5890D9510c9bB60e170CB0D",
  },
  {
    erc20Address: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59",
    symbol: "COW",
    name: "CoW Protocol",
    chain: "ethereum",
    acquireHint:
      "Swap Sepolia ETH for COW on CoW Swap. First get Sepolia ETH from a faucet, then swap.",
    faucetUrl: "https://swap.cow.fi/#/11155111/swap/ETH/0x0625aFB445C3B6B7B929342a04A22599fd5dBB59",
  },
];

/** Shielded representations retain their underlying EVM token addresses. */
export const MIDNIGHT_TOKENS: TokenConfig[] = ERC20_TOKENS.map((t) => ({
  ...t,
  chain: "midnight" as const,
}));

/** Network-labelled token groups consumed by deposit selectors. */
export interface NetworkData {
  chain: "ethereum" | "midnight";
  chainName: string;
  symbol: string;
  tokens: TokenConfig[];
}

/** Deposit selector groups pairing chain labels with their token catalogues. */
export const NETWORKS_WITH_TOKENS: NetworkData[] = [
  {
    chain: "ethereum",
    chainName: "Ethereum",
    symbol: "ethereum",
    tokens: ERC20_TOKENS,
  },
  {
    chain: "midnight",
    chainName: "Midnight",
    symbol: "midnight",
    tokens: MIDNIGHT_TOKENS,
  },
];

const ERC20_ALLOWLIST_SET = new Set(ERC20_TOKENS.map((t) => t.erc20Address.toLowerCase()));

/**
 * Checks catalogue membership independently of address casing.
 *
 * @param address - EVM token address to check.
 * @returns Whether the token is offered by this application.
 */
export function isErc20Allowed(address: string): boolean {
  return ERC20_ALLOWLIST_SET.has(address.toLowerCase());
}

const ERC20_TOKEN_MAP = new Map<string, TokenConfig>(
  ERC20_TOKENS.map((token) => [token.erc20Address.toLowerCase(), token]),
);

/**
 * Resolves display and operation metadata independently of address casing.
 *
 * @param address - EVM token address to look up.
 * @returns Its catalogue entry, or undefined for an unsupported token.
 */
export function getErc20Token(address: string): TokenConfig | undefined {
  return ERC20_TOKEN_MAP.get(address.toLowerCase());
}

/**
 * Caches contract-reported precision by chain, RPC endpoint and token address.
 *
 * @param address - Supported EVM token address.
 * @param config - Captured public RPC configuration.
 * @returns The token contract's decimals value.
 * @throws {Error} If the token is unsupported or its contract read fails.
 */
export async function fetchErc20Decimals(address: string, config: EvmChainConfig): Promise<number> {
  if (!isErc20Allowed(address)) {
    throw new Error(`Token not supported: ${address}`);
  }

  const normalizedAddress = address.toLowerCase();

  return queryClient.fetchQuery({
    queryKey: ["erc20-decimals", config.chainId?.toString(), config.rpcUrl, normalizedAddress],
    staleTime: Infinity,
    queryFn: () =>
      getEthereumProvider(config).readContract({
        address: address as Hex,
        abi: erc20Abi,
        functionName: "decimals",
      }),
  });
}
