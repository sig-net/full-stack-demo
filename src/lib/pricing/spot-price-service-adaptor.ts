import 'server-only'

import { z } from 'zod'

import type { SpotPrice } from '@/lib/pricing/spot-price'
import { listSpotPricesArgsSchema, type SpotPriceService } from '@/lib/pricing/spot-price-service'
import type { Logger } from '@/lib/logging/logger'

/** Adapts the spot price service to the wire: the requests are untrusted until parsed. */
export class SpotPriceServiceAdaptor {
  private readonly spotPriceService: SpotPriceService
  private readonly logger: Logger

  constructor(spotPriceService: SpotPriceService, logger: Logger) {
    this.spotPriceService = spotPriceService
    this.logger = logger
  }

  async listSpotPrices(args: unknown): Promise<SpotPriceListResult> {
    this.logger.debug('method called', { method: 'listSpotPrices' })
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
