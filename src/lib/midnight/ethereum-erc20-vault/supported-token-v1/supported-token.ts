import { z } from 'zod'

import { evmAddressSchema } from '@/lib/value-schemas'

/** The flat fee the vault takes on top of the principal of each action that surrenders a vault coin of the token, in the token's base units, zero where it charges none. */
export const vaultTokenFeesSchema = z.object({
  withdraw: z.bigint().nonnegative(),
  swap: z.bigint().nonnegative(),
  supply: z.bigint().nonnegative(),
  redeem: z.bigint().nonnegative(),
})

export type VaultTokenFees = z.infer<typeof vaultTokenFeesSchema>

/** An ERC20 the vault's allowlist admits, with the metadata its own contract reports and the fees the ledger holds for it. */
export const supportedTokenSchema = z.object({
  erc20Address: evmAddressSchema,
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(255),
  fees: vaultTokenFeesSchema,
})

export type SupportedToken = z.infer<typeof supportedTokenSchema>
