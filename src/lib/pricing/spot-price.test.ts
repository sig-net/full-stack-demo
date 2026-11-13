import { describe, expect, test } from 'vitest'

import { formatUsd, parseUsdPrice, priceRequestKey, usdValueOf } from '@/lib/pricing/spot-price'

describe('parseUsdPrice', () => {
  const cases: ReadonlyArray<{ name: string; text: string; expected?: bigint; error?: string }> = [
    { name: 'a whole dollar amount', text: '2425', expected: 242_500_000_000n },
    { name: 'a fraction shorter than the scale', text: '0.999727', expected: 99_972_700n },
    { name: 'a fraction at the scale', text: '1.00000001', expected: 100_000_001n },
    { name: 'zero', text: '0', expected: 0n },
    { name: 'a fraction past the scale', text: '1.000000001', error: 'at most 8 decimal places' },
    { name: 'scientific notation', text: '1e-7', error: 'plain decimal' },
    { name: 'a negative price', text: '-1', error: 'plain decimal' },
  ]
  test.each(cases)('$name', ({ text, expected, error }) => {
    if (error === undefined) expect(parseUsdPrice(text)).toBe(expected)
    else expect(() => parseUsdPrice(text)).toThrow(error)
  })
})

describe('usdValueOf and formatUsd', () => {
  const cases: ReadonlyArray<{
    name: string
    baseUnits: bigint
    decimals: number
    usd: bigint
    expected: string
  }> = [
    {
      name: '1 USDC at 0.999727',
      baseUnits: 1_000_000n,
      decimals: 6,
      usd: 99_972_700n,
      expected: '1.00',
    },
    {
      name: '142.5 USDC at 0.999727',
      baseUnits: 142_500_000n,
      decimals: 6,
      usd: 99_972_700n,
      expected: '142.46',
    },
    {
      name: '0.3 ETH at 2425.54',
      baseUnits: 300_000_000_000_000_000n,
      decimals: 18,
      usd: 242_554_000_000n,
      expected: '727.66',
    },
    {
      name: 'half a cent rounds up',
      baseUnits: 5_000n,
      decimals: 6,
      usd: 100_000_000n,
      expected: '0.01',
    },
    {
      name: 'under half a cent rounds down',
      baseUnits: 4_999n,
      decimals: 6,
      usd: 100_000_000n,
      expected: '0.00',
    },
    { name: 'nothing', baseUnits: 0n, decimals: 6, usd: 100_000_000n, expected: '0.00' },
  ]
  test.each(cases)('$name', ({ baseUnits, decimals, usd, expected }) => {
    expect(formatUsd(usdValueOf(baseUnits, decimals, usd))).toBe(expected)
  })
})

describe('priceRequestKey', () => {
  test('names a coin and a share without ambiguity', () => {
    expect(priceRequestKey({ kind: 'coin', coinId: 'usd-coin' })).toBe('coin:usd-coin')
    expect(
      priceRequestKey({
        kind: 'erc4626Share',
        wrapperErc20Address: `0x${'5a'.repeat(20)}`,
        underlyingCoinId: 'usd-coin',
      }),
    ).toBe(`erc4626Share:0x${'5a'.repeat(20)}:usd-coin`)
  })
})
