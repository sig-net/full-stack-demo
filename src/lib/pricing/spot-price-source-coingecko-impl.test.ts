import { describe, expect, test } from 'vitest'

import { SpotPriceSourceCoinGeckoImpl } from '@/lib/pricing/spot-price-source-coingecko-impl'

function sourceOver(status: number, body: unknown, requests: string[] = []) {
  const fetchFn: typeof fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : input.toString())
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return new SpotPriceSourceCoinGeckoImpl('https://example.test/api/v3/', fetchFn)
}

describe('SpotPriceSourceCoinGeckoImpl', () => {
  test('asks for every id once, in one request, and scales each quote', async () => {
    const requests: string[] = []
    const source = sourceOver(
      200,
      { 'usd-coin': { usd: 0.999727 }, ethereum: { usd: 2425.54 } },
      requests,
    )
    const prices = await source.readCoinPrices(['usd-coin', 'ethereum', 'usd-coin'])
    expect(requests).toEqual([
      'https://example.test/api/v3/simple/price?ids=usd-coin%2Cethereum&vs_currencies=usd',
    ])
    expect([...prices]).toEqual([
      ['usd-coin', 99_972_700n],
      ['ethereum', 242_554_000_000n],
    ])
  })

  test('leaves out a coin the market does not quote', async () => {
    const source = sourceOver(200, { 'usd-coin': { usd: 1 }, 'no-such-coin': {} })
    expect([...(await source.readCoinPrices(['usd-coin', 'no-such-coin']))]).toEqual([
      ['usd-coin', 100_000_000n],
    ])
  })

  test('makes no request for no ids', async () => {
    const requests: string[] = []
    expect((await sourceOver(200, {}, requests).readCoinPrices([])).size).toBe(0)
    expect(requests).toEqual([])
  })

  test('a refusal is an error naming the status', async () => {
    await expect(sourceOver(429, {}).readCoinPrices(['usd-coin'])).rejects.toThrow('429')
  })

  test('a malformed answer is an error', async () => {
    await expect(
      sourceOver(200, { 'usd-coin': { usd: 'one' } }).readCoinPrices(['usd-coin']),
    ).rejects.toThrow('malformed')
  })
})
