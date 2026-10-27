'use client'

import type { ReactNode } from 'react'

import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useMidnightBalances } from '@/components/use-midnight-balances'
import { useSpotPrices } from '@/components/use-spot-prices'
import { formatUsd, usdValueOf } from '@/lib/pricing/spot-price'

/**
 * The wallet's balances valued at spot and summed. A balance without a price is counted
 * beside the figure rather than as zero, and no wallet reads as nothing to value.
 */
export function TotalBalance(): ReactNode {
  const registry = useTokenInfoRegistry()
  const balances = useMidnightBalances()
  const prices = useSpotPrices()
  let total = 0n
  let unpriced = 0
  for (const balance of balances.data ?? []) {
    const info = registry.get({ ledger: 'shielded', tokenType: balance.tokenType })
    const usd = info === undefined ? undefined : prices.table.usdPriceOf(info)
    if (info === undefined || usd === undefined) unpriced += 1
    else total += usdValueOf(balance.baseUnits, info.decimals, usd)
  }
  return (
    <div className="flex flex-col gap-1.25 md:gap-3.75">
      <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase md:text-base">
        Total balance
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-2xl font-light tracking-tight text-foreground md:text-5xl">
          {balances.data === undefined ? '$0.00' : `$${formatUsd(total)}`}
        </span>
        {unpriced > 0 && (
          <span role="status" className="text-xs text-muted-foreground md:text-sm">
            {prices.error === null
              ? `${String(unpriced)} unpriced`
              : `prices unavailable: ${prices.error.message}`}
          </span>
        )}
      </span>
    </div>
  )
}
