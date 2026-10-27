import type { DustWalletCapabilities } from '@midnightntwrk/wallet-sdk-dust-wallet'
import type { CoreWallet, DustFullInfo } from '@midnightntwrk/wallet-sdk-dust-wallet/v1'
import type { FacadeState } from '@midnightntwrk/wallet-sdk-facade'
import { describe, expect, test } from 'vitest'

import { totalDust } from '@/lib/midnight/wallet/seed-wallet-facade'
import { mock } from '@/lib/testing/mock'

describe('totalDust', () => {
  test.each<{ name: string; generatedNow: bigint[]; expected: bigint }>([
    { name: 'no coins', generatedNow: [], expected: 0n },
    { name: 'one spendable coin', generatedNow: [3n], expected: 3n },
    {
      name: 'a spendable coin and one a transaction in flight spends',
      generatedNow: [3n, 4n],
      expected: 7n,
    },
  ])('$name', ({ generatedNow, expected }) => {
    const now = new Date()
    const state = mock<CoreWallet>('CoreWallet')
    const dust = mock<FacadeState['dust']>('DustWalletState', {
      state,
      capabilities: mock<DustWalletCapabilities>('DustWalletCapabilities', {
        coinsAndBalances: mock<DustWalletCapabilities['coinsAndBalances']>('CoinsAndBalances', {
          getTotalCoins: (read, time) => {
            expect(read).toBe(state)
            expect(time).toBe(now)
            return generatedNow.map((value) =>
              mock<DustFullInfo>('DustFullInfo', { generatedNow: value }),
            )
          },
        }),
      }),
    })
    expect(totalDust(dust, now)).toBe(expected)
  })
})
