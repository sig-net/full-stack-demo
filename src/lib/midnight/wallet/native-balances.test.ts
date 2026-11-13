import { nativeToken } from '@midnightntwrk/ledger-v9'
import { describe, expect, test } from 'vitest'

import { type NativeBalances, readNativeBalances } from '@/lib/midnight/wallet/native-balances'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

describe('readNativeBalances', () => {
  const cases: ReadonlyArray<{
    name: string
    unshielded: Record<string, bigint>
    dust: { cap: bigint; balance: bigint }
    expected: NativeBalances
  }> = [
    {
      name: 'NIGHT under the native token type beside another unshielded token',
      unshielded: { [nativeToken().raw]: 2_500_000n, ['ab'.repeat(32)]: 7n },
      dust: { cap: 5_000_000_000_000_000n, balance: 3_000_000_000_000_000n },
      expected: { night: 2_500_000n, dust: 3_000_000_000_000_000n },
    },
    {
      name: 'no NIGHT at all',
      unshielded: { ['ab'.repeat(32)]: 7n },
      dust: { cap: 0n, balance: 0n },
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
