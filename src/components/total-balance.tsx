import type { ReactNode } from 'react'

/** Placeholder figure until balances are wired to a data source. */
const TOTAL_BALANCE_PLACEHOLDER = '$6888.02'

export function TotalBalance(): ReactNode {
  return (
    <div className="flex flex-col gap-1.25 md:gap-3.75">
      <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase md:text-base">
        Total balance
      </span>
      <span className="font-mono text-2xl font-light tracking-tight text-foreground md:text-5xl">
        {TOTAL_BALANCE_PLACEHOLDER}
      </span>
    </div>
  )
}
