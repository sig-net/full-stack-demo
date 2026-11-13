import { formatUsd, priceRequestKey, type SpotPrice, usdValueOf } from '@/lib/pricing/spot-price'
import type { TokenInfo } from '@/lib/tokens/token-info'

/** The prices a page holds, looked up by the token they value. A token without one values to null. */
export class SpotPriceTable {
  private readonly byKey: ReadonlyMap<string, SpotPrice>

  constructor(prices: readonly SpotPrice[]) {
    this.byKey = new Map(prices.map((price) => [price.key, price]))
  }

  /** The token's spot price, scaled, or undefined when the token is unpriced or the table holds no price for it. */
  usdPriceOf(token: TokenInfo): bigint | undefined {
    return token.pricing === null ? undefined : this.byKey.get(priceRequestKey(token.pricing))?.usd
  }

  /** `baseUnits` of the token to the cent, or null when the token is unpriced. */
  usdValueOf(token: TokenInfo, baseUnits: bigint): string | null {
    const usd = this.usdPriceOf(token)
    return usd === undefined ? null : formatUsd(usdValueOf(baseUnits, token.decimals, usd))
  }
}

/** A table with no prices, for the moment before the query answers and for tests. */
export const NO_PRICES = new SpotPriceTable([])
