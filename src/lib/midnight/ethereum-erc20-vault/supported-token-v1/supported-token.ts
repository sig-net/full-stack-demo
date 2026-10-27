import { z } from 'zod'

import { evmAddressSchema } from '@/lib/value-schemas'

/** An ERC20 the vault's allowlist admits, with the metadata its own contract reports. */
export const supportedTokenSchema = z.object({
  erc20Address: evmAddressSchema,
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(255),
})

export type SupportedToken = z.infer<typeof supportedTokenSchema>
