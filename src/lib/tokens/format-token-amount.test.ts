import { describe, expect, test } from 'vitest'

import { formatTokenAmount } from '@/lib/tokens/format-token-amount'

const cases: { name: string; baseUnits: bigint; decimals: number; expected: string }[] = [
  { name: 'zero is 0', baseUnits: 0n, decimals: 6, expected: '0' },
  { name: 'a whole number keeps no point', baseUnits: 5_000_000n, decimals: 6, expected: '5' },
  { name: 'trailing zeros are dropped', baseUnits: 1_500_000n, decimals: 6, expected: '1.5' },
  { name: 'a fraction below one is zero-led', baseUnits: 13_000n, decimals: 6, expected: '0.013' },
  {
    name: 'the smallest unit shows every place',
    baseUnits: 1n,
    decimals: 18,
    expected: '0.000000000000000001',
  },
  { name: 'no decimals writes base units', baseUnits: 123n, decimals: 0, expected: '123' },
  {
    name: 'large amounts carry no separators',
    baseUnits: 250_000_000_000_000n,
    decimals: 6,
    expected: '250000000',
  },
  {
    name: 'a negative amount keeps its sign',
    baseUnits: -1_500_000n,
    decimals: 6,
    expected: '-1.5',
  },
]

describe('formatTokenAmount', () => {
  test.each(cases)('$name', ({ baseUnits, decimals, expected }) => {
    expect(formatTokenAmount(baseUnits, decimals)).toBe(expected)
  })

  test.each([-1, 1.5, Number.NaN])('decimals %s is refused', (decimals) => {
    expect(() => formatTokenAmount(1n, decimals)).toThrow('non-negative integer')
  })
})
