"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

import { stataAssetsPerShare } from "@/lib/midnight/evm-stata";
import { useRuntimeConfig } from "@/providers/runtime-config-context";

const COINGECKO_API = "https://api.coingecko.com/api/v3";

const TOKEN_ID_MAP: Record<string, string> = {
  USDC: "usd-coin",
  "USDC.A": "usd-coin",
  ETH: "ethereum",
  BTC: "bitcoin",
  DAI: "dai",
  COW: "cow-protocol",
};

/** Display-only USD quote and optional daily percentage change for a token symbol. */
export interface TokenPrice {
  symbol: string;
  usd: number;
  change24h?: number;
}

async function fetchTokenPrices(
  symbols: string[],
  rpcUrl: string,
): Promise<Record<string, TokenPrice>> {
  if (symbols.length === 0) return {};

  const coinIds = symbols.map((symbol) => TOKEN_ID_MAP[symbol.toUpperCase()]).filter(Boolean);

  if (coinIds.length === 0) return {};

  const response = await fetch(
    `${COINGECKO_API}/simple/price?ids=${coinIds.join(",")}&vs_currencies=usd&include_24hr_change=true`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch token prices");
  }

  const input: unknown = await response.json();
  const data = z
    .record(z.string(), z.object({ usd: z.number(), usd_24h_change: z.number().optional() }))
    .parse(input);

  const prices: Record<string, TokenPrice> = {};

  Object.entries(TOKEN_ID_MAP).forEach(([symbol, coinId]) => {
    const quote = data[coinId];
    if (quote) {
      prices[symbol] = {
        symbol,
        usd: quote.usd,
        change24h: quote.usd_24h_change,
      };
    }
  });

  if (symbols.some((s) => s.toUpperCase() === "STATAUSDC") && prices.USDC) {
    try {
      const rate = await stataAssetsPerShare(rpcUrl);
      prices.STATAUSDC = {
        symbol: "stataUSDC",
        usd: prices.USDC.usd * rate,
        change24h: prices.USDC.change24h,
      };
    } catch {
      /* Failed redemption reads leave the share unpriced. */
    }
  }

  return prices;
}

/**
 * Shares display quotes by symbol set and the applied RPC used for wrapper share valuation.
 *
 * @param symbols - Token symbols requested by the current view.
 * @returns Cached display-price query state with periodic foreground refresh.
 */
export function useTokenPrices(symbols: string[] = []): UseQueryResult<Record<string, TokenPrice>> {
  const { applied } = useRuntimeConfig();
  return useQuery({
    queryKey: ["tokenPrices", applied.evm.rpcUrl, symbols.toSorted()],
    queryFn: () => fetchTokenPrices(symbols, applied.evm.rpcUrl),
    staleTime: 120000,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
    enabled: symbols.length > 0,
  });
}

/**
 * Projects one case-insensitive symbol from the shared price query.
 *
 * @param symbol - Token symbol requested by the view.
 * @returns The matching price and the underlying query status.
 */
export function useTokenPrice(
  symbol: string,
): Omit<UseQueryResult<Record<string, TokenPrice>>, "data"> & { data: TokenPrice | undefined } {
  const { data: prices, ...rest } = useTokenPrices([symbol]);

  return {
    ...rest,
    data: prices?.[symbol.toUpperCase()],
  };
}
