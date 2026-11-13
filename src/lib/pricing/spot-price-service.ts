import { z } from 'zod'

import { type PriceRequest, priceRequestSchema, type SpotPrice } from '@/lib/pricing/spot-price'

/**
 * Spot prices for display. The prices are public market data, so the read takes no caller, and
 * the service answers from its own cache so a page's reloads never reach the market source at
 * the page's rate.
 */
export interface SpotPriceService {
  /** One price per request the service can answer, in request order; an unpriced request is left out. */
  listSpotPrices(args: ListSpotPricesArgs): Promise<SpotPrice[]>
}

/** A page asks for every token it shows at once, so the bound is the size of a token table, not a stream. */
export const MAX_PRICE_REQUESTS = 50

export const listSpotPricesArgsSchema = z.object({
  requests: z.array(priceRequestSchema).max(MAX_PRICE_REQUESTS),
})
export type ListSpotPricesArgs = z.infer<typeof listSpotPricesArgsSchema>

export type { PriceRequest }
