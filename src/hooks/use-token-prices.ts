'use client';

import { useQuery } from '@tanstack/react-query';

import { getEvmChainConfig } from '@/lib/config/evm';
import { stataAssetsPerShare } from '@/lib/midnight/evm-stata';

// CoinGecko API for token prices
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Token symbol to CoinGecko ID mapping
const TOKEN_ID_MAP: Record<string, string> = {
  USDC: 'usd-coin',
  'USDC.A': 'usd-coin',
  ETH: 'ethereum',
  BTC: 'bitcoin',
  DAI: 'dai',
  COW: 'cow-protocol',
};

export interface TokenPrice {
  symbol: string;
  usd: number;
  change24h?: number;
}

async function fetchTokenPrices(
  symbols: string[],
): Promise<Record<string, TokenPrice>> {
  if (symbols.length === 0) return {};

  const coinIds = symbols
    .map(symbol => TOKEN_ID_MAP[symbol.toUpperCase()])
    .filter(Boolean);

  if (coinIds.length === 0) return {};

  const response = await fetch(
    `${COINGECKO_API}/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`,
  );

  if (!response.ok) {
    throw new Error('Failed to fetch token prices');
  }

  const data = await response.json();

  const prices: Record<string, TokenPrice> = {};

  Object.entries(TOKEN_ID_MAP).forEach(([symbol, coinId]) => {
    if (data[coinId]) {
      prices[symbol] = {
        symbol,
        usd: data[coinId].usd,
        change24h: data[coinId].usd_24h_change,
      };
    }
  });

  // stataUSDC is not a CoinGecko asset, and it is not worth one dollar either: it is an
  // ERC-4626 share over Aave USDC whose value grows with accrued interest. Price it as
  // what it redeems for — assets per share, read on-chain, times the USDC price.
  if (
    symbols.some(s => s.toUpperCase() === 'STATAUSDC') &&
    prices.USDC
  ) {
    try {
      const rate = await stataAssetsPerShare(
        getEvmChainConfig().rpcUrl,
      );
      prices.STATAUSDC = {
        symbol: 'stataUSDC',
        usd: prices.USDC.usd * rate,
        change24h: prices.USDC.change24h,
      };
    } catch {
      /* leave it unpriced rather than showing a wrong number */
    }
  }

  return prices;
}

export function useTokenPrices(symbols: string[] = []) {
  return useQuery({
    queryKey: ['tokenPrices', symbols.sort()],
    queryFn: () => fetchTokenPrices(symbols),
    staleTime: 120000,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
    enabled: symbols.length > 0,
  });
}

export function useTokenPrice(symbol: string) {
  const { data: prices, ...rest } = useTokenPrices([symbol]);

  return {
    ...rest,
    data: prices?.[symbol.toUpperCase()],
  };
}
