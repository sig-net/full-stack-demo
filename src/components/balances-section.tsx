import { Download } from 'lucide-react'
import type { ReactNode } from 'react'

import { BalanceBox } from '@/components/balance-box'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DUMMY_BALANCES } from '@/lib/balances/dummy-balances'

export function BalancesSection(): ReactNode {
  return (
    <section
      aria-labelledby="balances-title"
      className="@container flex min-h-0 flex-1 flex-col gap-4 md:gap-4.5"
    >
      <div className="flex items-start justify-between border-t border-section-rule pt-5 pb-5.25">
        <h2
          id="balances-title"
          className="text-base/4.5 font-bold tracking-widest text-subtle-foreground uppercase"
        >
          Balances
        </h2>
        <Button size="lg">
          <Download aria-hidden />
          <span className="px-0.5">Deposit</span>
        </Button>
      </div>
      {/* Two columns from 862px: each box's content is 410px wide (amount group, gap, Swap and Send), plus the 42px gap. */}
      <ScrollArea className="md:max-h-50">
        <ul className="grid grid-cols-1 md:gap-y-4.5 @min-[862px]:grid-cols-2 @min-[862px]:gap-x-10.5">
          {DUMMY_BALANCES.map((balance) => (
            <li key={`${balance.networkName}:${balance.assetSymbol}`}>
              <BalanceBox balance={balance} />
            </li>
          ))}
        </ul>
      </ScrollArea>
    </section>
  )
}
