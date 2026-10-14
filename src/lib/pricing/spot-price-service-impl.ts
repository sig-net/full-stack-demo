import 'server-only'

import { CoalescingRunner } from '@/lib/coalescing-runner'
import type { Erc4626Reader } from '@/lib/ethereum/erc4626-reader'
import { messageOf } from '@/lib/message-of'
import { type PriceRequest, priceRequestKey, type SpotPrice } from '@/lib/pricing/spot-price'
import type { ListSpotPricesArgs, SpotPriceService } from '@/lib/pricing/spot-price-service'
import type { SpotPriceSource } from '@/lib/pricing/spot-price-source'

/** A price is served from the cache for this long before a read refreshes it. */
export const PRICE_TTL_MS = 10 * 60_000
/** A price whose refreshes keep failing is still served for this long after it was fetched, then withheld. */
export const PRICE_STALE_CEILING_MS = 60 * 60_000
/** After a failed refresh, no read tries the source again for this long, so a down source is not hammered. */
export const REFRESH_RETRY_DELAY_MS = 30_000

/**
 * The cache in front of the market source. Every read serves what it holds and refreshes only
 * the entries past their TTL, in one source request shared by every read waiting on it. A
 * refresh that fails leaves the old entries in place and backs off, so a source outage degrades
 * to stale prices and then to none, never to zeros.
 */
export class SpotPriceServiceImpl implements SpotPriceService {
  private readonly source: SpotPriceSource
  private readonly erc4626Reader: Erc4626Reader
  private readonly now: () => Date
  private readonly cache = new Map<string, CacheEntry>()
  private readonly pending = new Set<string>()
  private readonly refresher: CoalescingRunner
  private lastFailedRefresh: number | undefined

  constructor(
    source: SpotPriceSource,
    erc4626Reader: Erc4626Reader,
    now: () => Date = () => new Date(),
  ) {
    this.source = source
    this.erc4626Reader = erc4626Reader
    this.now = now
    this.refresher = new CoalescingRunner(() => this.refreshPending())
  }

  async listSpotPrices({ requests }: ListSpotPricesArgs): Promise<SpotPrice[]> {
    const time = this.now().getTime()
    const stale = requests.filter((request) => !this.fresh(request, time))
    if (stale.length > 0 && this.mayRefresh(time)) {
      for (const request of stale) this.pending.add(priceRequestKey(request))
      await this.refresher.run()
    }
    return requests.flatMap((request) => {
      const key = priceRequestKey(request)
      const entry = this.cache.get(key)
      if (entry?.usd === undefined || time - entry.fetchTime.getTime() > PRICE_STALE_CEILING_MS) {
        return []
      }
      return [{ key, usd: entry.usd, fetchTime: entry.fetchTime }]
    })
  }

  private fresh(request: PriceRequest, time: number): boolean {
    const entry = this.cache.get(priceRequestKey(request))
    return entry !== undefined && time - entry.fetchTime.getTime() <= PRICE_TTL_MS
  }

  private mayRefresh(time: number): boolean {
    return (
      this.lastFailedRefresh === undefined ||
      time - this.lastFailedRefresh >= REFRESH_RETRY_DELAY_MS
    )
  }

  /** One source request for every pending key still stale, then once more if keys arrived meanwhile. */
  private async refreshPending(): Promise<boolean> {
    const time = this.now().getTime()
    const requests = [...this.pending]
      .map(parsePriceRequestKey)
      .filter((request) => !this.fresh(request, time))
    this.pending.clear()
    if (requests.length === 0) return false
    try {
      const coinIds = requests.map((request) =>
        request.kind === 'coin' ? request.coinId : request.underlyingCoinId,
      )
      const quotes = await this.source.readCoinPrices(coinIds)
      const fetchTime = this.now()
      for (const request of requests) {
        this.cache.set(priceRequestKey(request), {
          usd: await this.priceOf(request, quotes),
          fetchTime,
        })
      }
    } catch (error: unknown) {
      this.lastFailedRefresh = this.now().getTime()
      console.warn(`Refreshing spot prices failed, serving the cached ones: ${messageOf(error)}`)
    }
    return this.pending.size > 0
  }

  /** The request's USD price from the quotes, or undefined when the market does not quote its coin. */
  private async priceOf(
    request: PriceRequest,
    quotes: ReadonlyMap<string, bigint>,
  ): Promise<bigint | undefined> {
    switch (request.kind) {
      case 'coin':
        return quotes.get(request.coinId)
      case 'erc4626Share': {
        const underlying = quotes.get(request.underlyingCoinId)
        if (underlying === undefined) return undefined
        const { assets, assetDecimals } = await this.erc4626Reader.assetsPerShare(
          request.wrapperErc20Address,
        )
        return (underlying * assets) / 10n ** BigInt(assetDecimals)
      }
      default: {
        const unhandled: never = request
        throw new Error(`Unhandled request ${JSON.stringify(unhandled)}`)
      }
    }
  }
}

/** A fetched entry: `usd` undefined records that the market quotes nothing for it, so it is not asked again before its TTL. */
interface CacheEntry {
  readonly usd: bigint | undefined
  readonly fetchTime: Date
}

/** The inverse of `priceRequestKey()`, for the pending set, which holds keys so two spellings of one request coalesce. */
function parsePriceRequestKey(key: string): PriceRequest {
  const [kind, ...rest] = key.split(':')
  if (kind === 'coin' && rest.length === 1 && rest[0] !== undefined) {
    return { kind, coinId: rest[0] }
  }
  if (
    kind === 'erc4626Share' &&
    rest.length === 2 &&
    rest[0] !== undefined &&
    rest[1] !== undefined
  ) {
    return { kind, wrapperErc20Address: rest[0], underlyingCoinId: rest[1] }
  }
  throw new Error(`Not a price request key: ${key}`)
}
