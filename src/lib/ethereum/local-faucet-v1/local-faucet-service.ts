import { z } from 'zod'

import type { AccountFunding } from '@/lib/ethereum/local-faucet-v1/account-funding'
import type { Erc20Funding } from '@/lib/ethereum/local-faucet-v1/erc20-funding'
import { amountSchema, evmAddressSchema } from '@/lib/value-schemas'

/**
 * Free ETH and ERC20s for any account on the local chain, where balances are test fixtures. The
 * backend builds this service for the local stack only, so no caller is involved and no deployed
 * chain can be reached through it.
 */
export interface LocalFaucetService {
  /** Adds `FAUCET_AMOUNT` to the account's balance. */
  fundAccount(args: FundAccountArgs): Promise<AccountFunding>
  /** Adds the amount, in the token's base units, to the account's balance of the ERC20. */
  fundErc20(args: FundErc20Args): Promise<Erc20Funding>
}

export const fundAccountArgsSchema = z.object({ account: evmAddressSchema })
export type FundAccountArgs = z.infer<typeof fundAccountArgsSchema>

export const fundErc20ArgsSchema = z.object({
  account: evmAddressSchema,
  erc20Address: evmAddressSchema,
  amount: amountSchema,
})
export type FundErc20Args = z.infer<typeof fundErc20ArgsSchema>

/** One ETH in wei, several hundred times a sweep's gas budget. */
export const FAUCET_AMOUNT = 1_000_000_000_000_000_000n
