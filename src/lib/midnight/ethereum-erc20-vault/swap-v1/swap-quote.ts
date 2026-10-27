import { z } from 'zod'

import { amountSchema, evmAddressSchema, uint64Schema } from '@/lib/value-schemas'

/** A slippage allowance in basis points, above zero and at most `SWAP_MAX_SLIPPAGE_BPS`. */
export const swapSlippageBpsSchema = uint64Schema.pipe(z.bigint().positive().max(5_000n))

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
  /** How far below `amountOut` the swap still accepts, in basis points. */
  slippageBps: swapSlippageBpsSchema,
  /** `amountOut` less the slippage allowance, which fits the complete circuit's mint. */
  amountOutMinimum: amountSchema,
})

export type SwapQuote = z.infer<typeof swapQuoteSchema>

/** The fee tiers a quote is sought on, every tier Uniswap V3 deploys pools under. */
export const SWAP_FEE_TIERS: readonly bigint[] = [500n, 3000n, 10000n]

/** The slippage allowance a quote takes unless the caller sets one: ten percent. */
export const SWAP_SLIPPAGE_BPS = 1_000n

/** The widest allowance a quote accepts: half the quoted output. */
export const SWAP_MAX_SLIPPAGE_BPS = 5_000n

export function amountOutMinimumOf(amountOut: bigint, slippageBps: bigint): bigint {
  return (amountOut * (10_000n - slippageBps)) / 10_000n
}
