import type { DustWalletTypes } from '@midnightntwrk/wallet-sdk-dust-wallet'
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
    const dust = mock<FacadeState['dust']>('DustWalletState', {
      totalCoins: generatedNow.map((value) =>
        mock<DustWalletTypes.DustFullInfo>('DustFullInfo', { generatedNow: value }),
      ),
    })
    expect(totalDust(dust)).toBe(expected)
  })
})
