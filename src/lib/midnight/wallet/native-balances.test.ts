import { nativeToken } from '@midnightntwrk/ledger-v9'
import { describe, expect, test } from 'vitest'

import { type NativeBalances, readNativeBalances } from '@/lib/midnight/wallet/native-balances'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

describe('readNativeBalances', () => {
  const cases: ReadonlyArray<{
    name: string
    available: Record<string, bigint>
    pending: Record<string, bigint>
    dust: bigint
    unregisteredNight?: bigint
    expected: NativeBalances
  }> = [
    {
      name: 'NIGHT under the native token type beside another unshielded token',
      available: { [nativeToken().raw]: 2_500_000n, ['ab'.repeat(32)]: 7n },
      pending: {},
      dust: 3_000_000_000_000_000n,
      unregisteredNight: 500_000n,
      expected: {
        availableNight: 2_500_000n,
        pendingNight: 0n,
        dust: 3_000_000_000_000_000n,
        unregisteredNight: 500_000n,
      },
    },
    {
      name: 'NIGHT an in-flight registration spends, none of it available',
      available: {},
      pending: { [nativeToken().raw]: 10_000_000n, ['ab'.repeat(32)]: 7n },
      dust: 0n,
      unregisteredNight: 0n,
      expected: { availableNight: 0n, pendingNight: 10_000_000n, dust: 0n, unregisteredNight: 0n },
    },
    {
      name: 'no NIGHT at all, from a wallet that cannot observe registration',
      available: {},
      pending: {},
      dust: 0n,
      expected: { availableNight: 0n, pendingNight: 0n, dust: 0n, unregisteredNight: null },
    },
  ]
  test.each(cases)('$name', async ({ available, pending, dust, unregisteredNight, expected }) => {
    const wallet = mock<Wallet>('Wallet', {
      getAvailableUnshieldedBalances: async () => available,
      getPendingUnshieldedBalances: async () => pending,
      getDustBalance: async () => dust,
      // The double answers every member, so the absent capability is spelt out as undefined.
      getUnregisteredNightBalance:
        unregisteredNight === undefined ? undefined : async () => unregisteredNight,
    })
    expect(await readNativeBalances(wallet)).toEqual(expected)
  })
})
