import { describe, expect, test } from 'vitest'

import { MAX_PRICE_REQUESTS, type SpotPriceService } from '@/lib/pricing/spot-price-service'
import { SpotPriceServiceAdaptor } from '@/lib/pricing/spot-price-service-adaptor'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const PRICE = {
  key: 'coin:usd-coin',
  usd: 100_000_000n,
  fetchTime: new Date('2026-01-01T00:00:00Z'),
}

function adaptorOver(received: object[] = []) {
  return new SpotPriceServiceAdaptor(
    mock<SpotPriceService>('SpotPriceService', {
      listSpotPrices: async (args) => {
        received.push(args)
        return [PRICE]
      },
    }),
    new RecordingLogger(),
  )
}

describe('SpotPriceServiceAdaptor', () => {
  test('passes parsed requests through', async () => {
    const received: object[] = []
    const requests = [
      { kind: 'coin', coinId: 'usd-coin' },
      {
        kind: 'erc4626Share',
        wrapperErc20Address: `0x${'5A'.repeat(20)}`,
        underlyingCoinId: 'usd-coin',
      },
    ]
    expect(await adaptorOver(received).listSpotPrices({ requests })).toEqual({
      ok: true,
      prices: [PRICE],
    })
    expect(received).toEqual([
      {
        requests: [
          { kind: 'coin', coinId: 'usd-coin' },
          {
            kind: 'erc4626Share',
            wrapperErc20Address: `0x${'5a'.repeat(20)}`,
            underlyingCoinId: 'usd-coin',
          },
        ],
      },
    ])
  })

  test('refuses a coin id that is not one, and more requests than a page needs', async () => {
    const received: object[] = []
    expect(
      await adaptorOver(received).listSpotPrices({
        requests: [{ kind: 'coin', coinId: 'USD Coin' }],
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('coin id') })
    expect(
      await adaptorOver(received).listSpotPrices({
        requests: Array.from({ length: MAX_PRICE_REQUESTS + 1 }, () => ({
          kind: 'coin',
          coinId: 'usd-coin',
        })),
      }),
    ).toMatchObject({ ok: false })
    expect(received).toEqual([])
  })
})
