'use server'

import type { ListSpotPricesArgs } from '@/lib/pricing/spot-price-service'
import type { SpotPriceListResult } from '@/lib/pricing/spot-price-service-adaptor'
import { getBackend } from '@/server/backend'

export async function listSpotPrices(args: ListSpotPricesArgs): Promise<SpotPriceListResult> {
  return (await getBackend()).pricing.spotPriceV1.adaptor.listSpotPrices(args)
}
