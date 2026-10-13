'use server'

import type { AccountFundingResult } from '@/lib/ethereum/local-faucet-v1/local-faucet-service-adaptor'
import type { FundAccountArgs } from '@/lib/ethereum/local-faucet-v1/local-faucet-service'
import { getBackend } from '@/server/backend'

export async function fundAccount(args: FundAccountArgs): Promise<AccountFundingResult> {
  return (await getBackend()).ethereum.localFaucetV1.adaptor.fundAccount(args)
}
