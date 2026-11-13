import 'server-only'

import { z } from 'zod'

import { parseUsdPrice, USD_PRICE_DECIMALS } from '@/lib/pricing/spot-price'
import type { SpotPriceSource } from '@/lib/pricing/spot-price-source'

/**
 * CoinGecko's keyless public API. Its per-IP pool is shared and dynamic, so the caller is
 * expected to cache: this source makes one request per read and never retries.
 */
export class SpotPriceSourceCoinGeckoImpl implements SpotPriceSource {
  private readonly baseURL: string
  private readonly fetchFn: typeof fetch

  constructor(baseURL: string = COINGECKO_PUBLIC_API_URL, fetchFn: typeof fetch = fetch) {
    this.baseURL = baseURL
    this.fetchFn = fetchFn
  }

  async readCoinPrices(coinIds: readonly string[]): Promise<ReadonlyMap<string, bigint>> {
    if (coinIds.length === 0) return new Map()
    const url = new URL('simple/price', this.baseURL)
    url.searchParams.set('ids', [...new Set(coinIds)].join(','))
    url.searchParams.set('vs_currencies', 'usd')
    const response = await this.fetchFn(url, { headers: { accept: 'application/json' } })
    if (!response.ok) {
      throw new Error(`CoinGecko answered ${String(response.status)}`)
    }
    const parsed = responseSchema.safeParse(await response.json())
    if (!parsed.success) {
      throw new Error(`CoinGecko's answer is malformed: ${z.prettifyError(parsed.error)}`)
    }
    return new Map(
      Object.entries(parsed.data).flatMap(([coinId, quote]) =>
        quote.usd === undefined
          ? []
          : [[coinId, parseUsdPrice(quote.usd.toFixed(USD_PRICE_DECIMALS))]],
      ),
    )
  }
}

export const COINGECKO_PUBLIC_API_URL = 'https://api.coingecko.com/api/v3/'

/** A coin the API does not quote in USD answers without the field, and an unknown id is left out. */
const responseSchema = z.record(z.string(), z.object({ usd: z.number().nonnegative().optional() }))
