import { describe, expect, test } from 'vitest'

import { parseTokenAmount } from '@/lib/tokens/parse-token-amount'

describe('parseTokenAmount', () => {
  test.each([
    { text: '100', decimals: 6, expected: 100_000_000n },
    { text: '12.5', decimals: 6, expected: 12_500_000n },
    { text: '0.000001', decimals: 6, expected: 1n },
    { text: ' 7 ', decimals: 0, expected: 7n },
    { text: '1.5', decimals: 18, expected: 1_500_000_000_000_000_000n },
  ])('reads $text with $decimals decimals', ({ text, decimals, expected }) => {
    expect(parseTokenAmount(text, decimals)).toBe(expected)
  })

  test.each([
    { name: 'excess precision', text: '1.1234567', decimals: 6, message: 'decimal places' },
    {
      name: 'a fraction on a zero-decimal token',
      text: '1.5',
      decimals: 0,
      message: 'decimal places',
    },
    { name: 'a sign', text: '-1', decimals: 6, message: 'plain decimal' },
    { name: 'an exponent', text: '1e6', decimals: 6, message: 'plain decimal' },
    { name: 'a thousands separator', text: '1,000', decimals: 6, message: 'plain decimal' },
    { name: 'an empty string', text: '', decimals: 6, message: 'plain decimal' },
  ])('refuses $name', ({ text, decimals, message }) => {
    expect(() => parseTokenAmount(text, decimals)).toThrow(message)
  })
})
