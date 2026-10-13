import { z } from 'zod'

import type { AccountFunding } from '@/lib/ethereum/local-faucet-v1/account-funding'
import { evmAddressSchema } from '@/lib/value-schemas'

/**
 * Free ETH for any account on the local chain, where balances are test fixtures. The backend
 * builds this service for the local stack only, so no caller is involved and no deployed chain
 * can be reached through it.
 */
export interface LocalFaucetService {
  /** Adds `FAUCET_AMOUNT` to the account's balance. */
  fundAccount(args: FundAccountArgs): Promise<AccountFunding>
}

export const fundAccountArgsSchema = z.object({ account: evmAddressSchema })
export type FundAccountArgs = z.infer<typeof fundAccountArgsSchema>

/** One ETH in wei, several hundred times a sweep's gas budget. */
export const FAUCET_AMOUNT = 1_000_000_000_000_000_000n
