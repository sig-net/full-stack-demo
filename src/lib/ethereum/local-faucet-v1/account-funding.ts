import { z } from 'zod'

import { evmAddressSchema } from '@/lib/value-schemas'

/** An account the local faucet topped up, with its balance in wei afterwards. */
export const accountFundingSchema = z.object({
  account: evmAddressSchema,
  balance: z.bigint().nonnegative(),
})

export type AccountFunding = z.infer<typeof accountFundingSchema>
