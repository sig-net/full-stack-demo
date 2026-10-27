import { z } from 'zod'

import { evmAddressSchema } from '@/lib/value-schemas'

/** A supported token the caller's deposit account holds, in the token's base units, above zero. */
export const depositAccountFundSchema = z.object({
  erc20Address: evmAddressSchema,
  amount: z.bigint().positive(),
})

export type DepositAccountFund = z.infer<typeof depositAccountFundSchema>
