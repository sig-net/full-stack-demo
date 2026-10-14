'use client'

import { useQuery } from '@tanstack/react-query'

import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { NO_PRICES, SpotPriceTable } from '@/lib/pricing/spot-price-table'
import { listSpotPrices } from '@/server/actions/spot-price-actions'

/** The server serves prices from a ten-minute cache, so the page asks at that pace and never faster. */
const PRICES_REFETCH_INTERVAL_MS = 10 * 60_000

/**
 * The spot prices of every token the registry values, read through the backend's cache. Until
 * the first answer, and for as long as the read fails, the table is empty and every value reads
 * as unpriced rather than as zero.
 */
export function useSpotPrices(): { table: SpotPriceTable; error: Error | null } {
  const registry = useTokenInfoRegistry()
  const priced = registry.priced()
  const prices = useQuery({
    queryKey: ['spot-prices', registry.fingerprint],
    queryFn: async () => {
      const result = await listSpotPrices({
        requests: priced.flatMap((token) => (token.pricing === null ? [] : [token.pricing])),
      })
      if (!result.ok) throw new Error(result.error)
      return new SpotPriceTable(result.prices)
    },
    staleTime: PRICES_REFETCH_INTERVAL_MS,
    refetchInterval: PRICES_REFETCH_INTERVAL_MS,
  })
  return { table: prices.data ?? NO_PRICES, error: prices.error }
}
