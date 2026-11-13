import { describe, expect, test } from 'vitest'

import type { Erc4626Reader } from '@/lib/ethereum/erc4626-reader'
import type { PriceRequest } from '@/lib/pricing/spot-price'
import {
  PRICE_STALE_CEILING_MS,
  PRICE_TTL_MS,
  REFRESH_RETRY_DELAY_MS,
  SpotPriceServiceImpl,
} from '@/lib/pricing/spot-price-service-impl'
import type { SpotPriceSource } from '@/lib/pricing/spot-price-source'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const USDC: PriceRequest = { kind: 'coin', coinId: 'usd-coin' }
const ETH: PriceRequest = { kind: 'coin', coinId: 'ethereum' }
const SHARE: PriceRequest = {
  kind: 'erc4626Share',
  wrapperErc20Address: `0x${'5a'.repeat(20)}`,
  underlyingCoinId: 'usd-coin',
}
const T0 = new Date('2026-01-01T00:00:00Z')

interface Harness {
  service: SpotPriceServiceImpl
  reads: string[][]
  rateReads: string[]
  advance: (ms: number) => void
  quotes: Map<string, bigint>
  fail: { value: boolean }
}

function harness(): Harness {
  let time = T0.getTime()
  const reads: string[][] = []
  const rateReads: string[] = []
  const quotes = new Map<string, bigint>([
    ['usd-coin', 100_000_000n],
    ['ethereum', 242_554_000_000n],
  ])
  const fail = { value: false }
  const service = new SpotPriceServiceImpl(
    mock<SpotPriceSource>('SpotPriceSource', {
      readCoinPrices: async (coinIds) => {
        reads.push([...coinIds])
        if (fail.value) throw new Error('rate limited')
        return new Map([...quotes].filter(([id]) => coinIds.includes(id)))
      },
    }),
    mock<Erc4626Reader>('Erc4626Reader', {
      assetsPerShare: async (wrapper) => {
        rateReads.push(wrapper)
        return { assets: 3_072_600n, assetDecimals: 6 }
      },
    }),
    new RecordingLogger(),
    () => new Date(time),
  )
  return {
    service,
    reads,
    rateReads,
    quotes,
    fail,
    advance: (ms) => {
      time += ms
    },
  }
}

describe('SpotPriceServiceImpl', () => {
  test('a first read fetches, a read within the TTL serves the cache', async () => {
    const h = harness()
    const first = await h.service.listSpotPrices({ requests: [USDC, ETH] })
    expect(first).toEqual([
      { key: 'coin:usd-coin', usd: 100_000_000n, fetchTime: T0 },
      { key: 'coin:ethereum', usd: 242_554_000_000n, fetchTime: T0 },
    ])
    h.advance(PRICE_TTL_MS)
    expect(await h.service.listSpotPrices({ requests: [USDC] })).toEqual([first[0]])
    expect(h.reads).toEqual([['usd-coin', 'ethereum']])
  })

  test('a read past the TTL refreshes only the stale entries', async () => {
    const h = harness()
    await h.service.listSpotPrices({ requests: [USDC] })
    h.advance(PRICE_TTL_MS / 2)
    await h.service.listSpotPrices({ requests: [ETH] })
    h.advance(PRICE_TTL_MS / 2 + 1)
    h.quotes.set('usd-coin', 99_000_000n)
    const prices = await h.service.listSpotPrices({ requests: [USDC, ETH] })
    expect(h.reads).toEqual([['usd-coin'], ['ethereum'], ['usd-coin']])
    expect(prices.map((price) => price.usd)).toEqual([99_000_000n, 242_554_000_000n])
  })

  test('concurrent reads coalesce, and a key fetched by the run in flight is not fetched again', async () => {
    const h = harness()
    await Promise.all([
      h.service.listSpotPrices({ requests: [USDC] }),
      h.service.listSpotPrices({ requests: [USDC, ETH] }),
    ])
    expect(h.reads).toEqual([['usd-coin'], ['ethereum']])
  })

  test('a share is the underlying quote times the assets a share pays out', async () => {
    const h = harness()
    expect(await h.service.listSpotPrices({ requests: [SHARE] })).toEqual([
      { key: `erc4626Share:0x${'5a'.repeat(20)}:usd-coin`, usd: 307_260_000n, fetchTime: T0 },
    ])
    expect(h.reads).toEqual([['usd-coin']])
    expect(h.rateReads).toEqual([`0x${'5a'.repeat(20)}`])
  })

  test('a coin the market does not quote is unpriced and not asked again before its TTL', async () => {
    const h = harness()
    const unknown: PriceRequest = { kind: 'coin', coinId: 'no-such-coin' }
    expect(await h.service.listSpotPrices({ requests: [unknown] })).toEqual([])
    expect(await h.service.listSpotPrices({ requests: [unknown] })).toEqual([])
    expect(h.reads).toEqual([['no-such-coin']])
  })

  test('a failed refresh serves the old price, backs off, then withholds it past the ceiling', async () => {
    const h = harness()
    await h.service.listSpotPrices({ requests: [USDC] })
    h.fail.value = true
    h.advance(PRICE_TTL_MS + 1)
    expect(await h.service.listSpotPrices({ requests: [USDC] })).toMatchObject([
      { usd: 100_000_000n, fetchTime: T0 },
    ])
    h.advance(REFRESH_RETRY_DELAY_MS - 1)
    await h.service.listSpotPrices({ requests: [USDC] })
    expect(h.reads).toHaveLength(2)
    h.advance(1)
    await h.service.listSpotPrices({ requests: [USDC] })
    expect(h.reads).toHaveLength(3)
    h.advance(PRICE_STALE_CEILING_MS)
    expect(await h.service.listSpotPrices({ requests: [USDC] })).toEqual([])
  })

  test('a refresh that fails on first fetch answers with no prices, never zeros', async () => {
    const h = harness()
    h.fail.value = true
    expect(await h.service.listSpotPrices({ requests: [USDC, ETH] })).toEqual([])
  })
})
