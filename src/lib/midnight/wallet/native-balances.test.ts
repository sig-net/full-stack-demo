import { nativeToken } from '@midnightntwrk/ledger-v9'
import { describe, expect, test } from 'vitest'

import { readNativeBalances } from '@/lib/midnight/wallet/native-balances'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

describe('readNativeBalances', () => {
  const cases: ReadonlyArray<{
    name: string
    unshielded: Record<string, bigint>
    dust: bigint
    expected: { night: bigint; dust: bigint }
  }> = [
    {
      name: 'NIGHT under the native token type beside another unshielded token',
      unshielded: { [nativeToken().raw]: 2_500_000n, ['ab'.repeat(32)]: 7n },
      dust: 3_000_000_000_000_000n,
      expected: { night: 2_500_000n, dust: 3_000_000_000_000_000n },
    },
    {
      name: 'no NIGHT at all',
      unshielded: {},
      dust: 0n,
      expected: { night: 0n, dust: 0n },
    },
  ]
  test.each(cases)('$name', async ({ unshielded, dust, expected }) => {
    const wallet = mock<Wallet>('Wallet', {
      getUnshieldedBalances: async () => unshielded,
      getDustBalance: async () => dust,
    })
    expect(await readNativeBalances(wallet)).toEqual(expected)
  })
})
