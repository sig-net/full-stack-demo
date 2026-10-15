import { z } from 'zod'

import { unshieldedAddressSchema } from '@/lib/value-schemas'

/** A wallet the local faucet sent NIGHT: the amount in STAR and the transfer's identifier on the chain. */
export const nightFundingSchema = z.object({
  unshieldedAddress: unshieldedAddressSchema,
  amount: z.bigint().positive(),
  transactionId: z.string(),
})

export type NightFunding = z.infer<typeof nightFundingSchema>
