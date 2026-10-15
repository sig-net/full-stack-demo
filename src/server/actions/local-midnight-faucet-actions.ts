'use server'

import type { NightFundingResult } from '@/lib/midnight/local-faucet-v1/local-midnight-faucet-service-adaptor'
import type { FundNightArgs } from '@/lib/midnight/local-faucet-v1/local-midnight-faucet-service'
import { getBackend } from '@/server/backend'

export async function fundNight(args: FundNightArgs): Promise<NightFundingResult> {
  return (await getBackend()).midnight.localFaucetV1.adaptor.fundNight(args)
}
