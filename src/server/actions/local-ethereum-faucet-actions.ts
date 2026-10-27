'use server'

import type {
  AccountFundingResult,
  Erc20FundingResult,
} from '@/lib/ethereum/local-faucet-v1/local-ethereum-faucet-service-adaptor'
import type {
  FundAccountArgs,
  FundErc20Args,
} from '@/lib/ethereum/local-faucet-v1/local-ethereum-faucet-service'
import { getBackend } from '@/server/backend'

export async function fundAccount(args: FundAccountArgs): Promise<AccountFundingResult> {
  return (await getBackend()).ethereum.localFaucetV1.adaptor.fundAccount(args)
}

export async function fundErc20(args: FundErc20Args): Promise<Erc20FundingResult> {
  return (await getBackend()).ethereum.localFaucetV1.adaptor.fundErc20(args)
}
