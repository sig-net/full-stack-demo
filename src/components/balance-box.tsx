import { ArrowRightLeft, Send } from 'lucide-react'
import type { ReactNode } from 'react'

import { TokenIcon } from '@/components/token-icon'
import { Button } from '@/components/ui/button'
import type { AssetAmount } from '@/lib/asset-amount'

interface BalanceBoxProps {
  balance: AssetAmount
}

/** One balance: amount, USD value and token, then the Swap and Send actions. */
export function BalanceBox({ balance }: BalanceBoxProps): ReactNode {
  const { assetSymbol, networkName, amount, usdValue } = balance
  const token = `${assetSymbol} on ${networkName}`
  return (
    <div className="flex flex-wrap items-start gap-x-8.25 gap-y-4 border-t border-balance-rule pt-4.75 pb-5 md:gap-x-11.25">
      <div className="flex w-44 shrink-0 items-start gap-2.5">
        <div className="flex w-25 shrink-0 flex-col gap-1.75">
          <span className="font-mono text-[32px] leading-[23px] font-light text-balance-foreground">
            {amount}
          </span>
          <span className="font-mono text-sm leading-[21px] font-medium tracking-[-0.01em] text-fiat-foreground">
            ${usdValue}
          </span>
        </div>
        <div className="flex h-7 shrink-0 items-center gap-1.5">
          <TokenIcon assetSymbol={assetSymbol} networkName={networkName} />
          <span className="text-base/6 font-bold tracking-[-0.01em] text-balance-foreground">
            {assetSymbol}
          </span>
        </div>
      </div>
      <div className="flex items-start gap-2.75">
        <Button variant="green" size="sm" aria-label={`Swap ${token}`}>
          <ArrowRightLeft aria-hidden />
          <span className="px-0.5">Swap</span>
        </Button>
        <Button variant="pink" size="sm" aria-label={`Send ${token}`}>
          <Send aria-hidden />
          <span className="px-0.5">Send</span>
        </Button>
      </div>
    </div>
  )
}
