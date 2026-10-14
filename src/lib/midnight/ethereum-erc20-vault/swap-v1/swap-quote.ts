import { z } from 'zod'

import { amountSchema, evmAddressSchema, uint64Schema } from '@/lib/value-schemas'

/**
 * A live price for selling `amountIn` of one vault token for another: the pool tier that pays
 * most, what it pays now, and the least a swap started on it accepts after the slippage
 * allowance. A swap started from a quote surrenders `amountIn` and asks for `amountOutMinimum`.
 */
export const swapQuoteSchema = z.object({
  erc20AddressIn: evmAddressSchema,
  erc20AddressOut: evmAddressSchema,
  amountIn: amountSchema,
  /** The Uniswap V3 pool fee tier the quote came from. */
  fee: uint64Schema,
  /** What the pool pays for `amountIn` now, in the bought token's base units. */
  amountOut: z.bigint().positive(),
  /** `amountOut` less the slippage allowance, which fits the complete circuit's mint. */
  amountOutMinimum: amountSchema,
})

export type SwapQuote = z.infer<typeof swapQuoteSchema>

/** The fee tiers a quote is sought on, every tier Uniswap V3 deploys pools under. */
export const SWAP_FEE_TIERS: readonly bigint[] = [500n, 3000n, 10000n]

/** How far below the quoted output a started swap still accepts, in basis points. */
export const SWAP_SLIPPAGE_BPS = 100n

export function amountOutMinimumOf(amountOut: bigint): bigint {
  return (amountOut * (10_000n - SWAP_SLIPPAGE_BPS)) / 10_000n
}
