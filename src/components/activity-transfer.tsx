import { ArrowRight, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from 'cn'

import { TokenIcon } from '@/components/token-icon'
import type { ActivityDestination } from '@/lib/activity/activity-entry'
import type { AssetAmount } from '@/lib/asset-amount'

interface ActivityTransferProps {
  from: AssetAmount
  to: ActivityDestination
}

/**
 * What an activity moved and where to. From `md` up each asset shows its token icon and USD value
 * and a wallet destination its wallet icon. Below `md` both sides are text only and wrap when the
 * column is too narrow.
 */
export function ActivityTransfer({ from, to }: ActivityTransferProps): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-x-3.75 md:flex-nowrap">
      <ActivityAsset asset={from} className="md:w-25" />
      <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">to</span>
      {to.kind === 'asset' ? (
        <ActivityAsset asset={to.asset} />
      ) : (
        <div className="flex items-center gap-1.75">
          <Wallet className="size-5 shrink-0 text-muted-foreground max-md:hidden" aria-hidden />
          <span className="text-sm/5 font-medium text-secondary-foreground">
            <span className="sr-only">wallet </span>
            {to.addressLabel}
          </span>
        </div>
      )}
    </div>
  )
}

interface ActivityAssetProps {
  asset: AssetAmount
  className?: string
}

function ActivityAsset({ asset, className }: ActivityAssetProps): ReactNode {
  const { assetSymbol, networkName, amount, usdValue } = asset
  return (
    <div className={cn('flex shrink-0 items-center gap-1.5', className)}>
      <div className="max-md:hidden">
        <TokenIcon assetSymbol={assetSymbol} networkName={networkName} />
      </div>
      {/* From md up the amount glyphs centre 5px and the USD glyphs 23.5px from the stack top. */}
      <div className="flex flex-col md:h-7">
        <span className="text-sm/5 font-medium text-secondary-foreground md:leading-2.5">
          {amount} {assetSymbol}
        </span>
        <span className="mt-2.5 text-[10px] leading-[7px] font-semibold text-fiat-foreground max-md:hidden">
          ${usdValue}
        </span>
      </div>
    </div>
  )
}
