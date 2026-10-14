import 'server-only'

import { z } from 'zod'

import type { SpotPrice } from '@/lib/pricing/spot-price'
import { listSpotPricesArgsSchema, type SpotPriceService } from '@/lib/pricing/spot-price-service'

/** Adapts the spot price service to the wire: the requests are untrusted until parsed. */
export class SpotPriceServiceAdaptor {
  private readonly spotPriceService: SpotPriceService

  constructor(spotPriceService: SpotPriceService) {
    this.spotPriceService = spotPriceService
  }

  async listSpotPrices(args: unknown): Promise<SpotPriceListResult> {
    const parsed = listSpotPricesArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, prices: await this.spotPriceService.listSpotPrices(parsed.data) }
  }
}

export type SpotPriceListResult =
  | { readonly ok: true; readonly prices: SpotPrice[] }
  | { readonly ok: false; readonly error: string }
