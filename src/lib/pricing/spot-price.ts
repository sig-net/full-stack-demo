import { z } from 'zod'

import { evmAddressSchema } from '@/lib/value-schemas'

/**
 * The spot price of one asset in US dollars at `fetchTime`, as the source last reported it.
 * `usd` is dollars scaled by ten to `USD_PRICE_DECIMALS`, so every value computed from it stays
 * in integer arithmetic until it is written out.
 */
export const spotPriceSchema = z.object({
  /** `priceRequestKey()` of the request the price answers. */
  key: z.string().min(1),
  usd: z.coerce.bigint().nonnegative(),
  fetchTime: z.coerce.date(),
})

export type SpotPrice = z.infer<typeof spotPriceSchema>

/** The decimal places `SpotPrice.usd` and every USD amount derived from it carry. */
export const USD_PRICE_DECIMALS = 8

/** CoinGecko's coin id, such as `usd-coin`: lower-case letters, digits and hyphens. */
export const coinIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/, 'expected a coin id')

/**
 * What to price: a coin the market quotes, or a share of an ERC-4626 wrapper, worth the
 * underlying's quote times the assets the wrapper pays out for one share.
 */
export const priceRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('coin'), coinId: coinIdSchema }),
  z.object({
    kind: z.literal('erc4626Share'),
    wrapperErc20Address: evmAddressSchema,
    underlyingCoinId: coinIdSchema,
  }),
])

export type PriceRequest = z.infer<typeof priceRequestSchema>

/** The one string that identifies a request, so a price table and its readers agree on the key. */
export function priceRequestKey(request: PriceRequest): string {
  switch (request.kind) {
    case 'coin':
      return `coin:${request.coinId}`
    case 'erc4626Share':
      return `erc4626Share:${request.wrapperErc20Address}:${request.underlyingCoinId}`
    default: {
      const unhandled: never = request
      throw new Error(`Unhandled request ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * A dollar figure as the source writes it (`1.0012`, `2425.54`) into the scaled integer,
 * refusing more fraction digits than the scale keeps, so nothing is rounded silently.
 */
export function parseUsdPrice(text: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim())
  if (match === null) throw new Error(`Expected a plain decimal price, got ${JSON.stringify(text)}`)
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > USD_PRICE_DECIMALS) {
    throw new Error(`A price carries at most ${String(USD_PRICE_DECIMALS)} decimal places`)
  }
  return BigInt(whole + fraction.padEnd(USD_PRICE_DECIMALS, '0'))
}

/** The value of `baseUnits` of a token with `decimals` at the scaled price, in the price's scale. */
export function usdValueOf(baseUnits: bigint, decimals: number, usd: bigint): bigint {
  return (baseUnits * usd) / 10n ** BigInt(decimals)
}

/** A scaled USD value written to the cent, rounded half up, such as `1470.67`. */
export function formatUsd(scaled: bigint): string {
  const centScale = 10n ** BigInt(USD_PRICE_DECIMALS - 2)
  const cents = (scaled + centScale / 2n) / centScale
  const digits = cents.toString().padStart(3, '0')
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`
}
