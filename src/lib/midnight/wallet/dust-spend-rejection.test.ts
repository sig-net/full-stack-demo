import { describe, expect, test } from 'vitest'

import { explainDustSpendRejection } from '@/lib/midnight/wallet/dust-spend-rejection'

describe('explainDustSpendRejection', () => {
  test.each([
    {
      name: 'explains the node error 170',
      message: 'Transaction submission failed: 1010: Invalid Transaction: Custom error: 170',
      explained: true,
    },
    {
      name: 'leaves another custom error alone',
      message: 'Transaction submission failed: 1010: Invalid Transaction: Custom error: 171',
      explained: false,
    },
    {
      name: 'leaves an unrelated message alone',
      message: 'Wallet disconnected.',
      explained: false,
    },
  ])('$name', ({ message, explained }) => {
    const result = explainDustSpendRejection(message)
    expect(result.startsWith(message)).toBe(true)
    expect(result.includes('DUST spend proof')).toBe(explained)
  })
})
