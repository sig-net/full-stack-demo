import { z } from 'zod'

import { evmAddressSchema } from '@/lib/value-schemas'

/** An account the local faucet gave an ERC20, with its balance of it in base units afterwards. */
export const erc20FundingSchema = z.object({
  account: evmAddressSchema,
  erc20Address: evmAddressSchema,
  balance: z.bigint().nonnegative(),
})

export type Erc20Funding = z.infer<typeof erc20FundingSchema>
