import { describe, expect, test } from 'vitest'

import { FINDER_SIZE, inFinder, qrModules } from '@/lib/qr-modules'

describe('qrModules', () => {
  test('an EVM address encodes to a square grid whose finder corners are dark', () => {
    const { size, dark } = qrModules('0x10B4a7c1E2f3d4e5F6a7B8c9D0e1F2a3B4c5D6fA')
    expect(size).toBeGreaterThanOrEqual(21)
    expect(size % 4).toBe(1)
    for (const { row, column } of [
      { row: 0, column: 0 },
      { row: 0, column: size - 1 },
      { row: size - 1, column: 0 },
    ]) {
      expect(dark(row, column)).toBe(true)
    }
  })

  test('the same value always encodes to the same grid', () => {
    const first = qrModules('same')
    const second = qrModules('same')
    expect(second.size).toBe(first.size)
    for (let row = 0; row < first.size; row += 1) {
      for (let column = 0; column < first.size; column += 1) {
        expect(second.dark(row, column)).toBe(first.dark(row, column))
      }
    }
  })
})

describe('inFinder', () => {
  const size = 25
  test.each([
    { name: 'top-left corner', row: 0, column: 0, expected: true },
    { name: 'top-right corner', row: 3, column: size - 1, expected: true },
    { name: 'bottom-left corner', row: size - 1, column: FINDER_SIZE - 1, expected: true },
    {
      name: 'bottom-right corner holds no finder',
      row: size - 1,
      column: size - 1,
      expected: false,
    },
    { name: 'the centre', row: 12, column: 12, expected: false },
    { name: 'just outside a finder', row: FINDER_SIZE, column: 0, expected: false },
  ])('$name', ({ row, column, expected }) => {
    expect(inFinder(size, row, column)).toBe(expected)
  })
})
