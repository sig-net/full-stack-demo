'use client'

import { skipToken, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import type { ReactNode } from 'react'

import { BalanceBox } from '@/components/balance-box'
import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { Button } from '@/components/ui/button'
import { readMidnightBalanceAmounts } from '@/lib/balances/midnight-balances'
import { walletConnectionStatus } from '@/lib/midnight/wallet/connection-status'

const BALANCES_REFETCH_INTERVAL_MS = 10_000

export function BalancesSection(): ReactNode {
  const { midnightNetwork } = useConfig()
  const connection = useMidnightWallet()
  const { wallet, generation } = connection
  const status = walletConnectionStatus(connection)
  const balances = useQuery({
    queryKey: ['midnight-balances', midnightNetwork.networkId, generation],
    queryFn: wallet === null ? skipToken : () => readMidnightBalanceAmounts(wallet),
    refetchInterval: BALANCES_REFETCH_INTERVAL_MS,
  })
  return (
    <section aria-labelledby="balances-title" className="@container flex flex-col gap-4 md:gap-4.5">
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
      {wallet === null ? (
        <p role="status" className="text-muted-foreground">
          {status === 'not connected'
            ? 'Connect a Midnight wallet to see balances.'
            : 'Connecting the Midnight wallet…'}
        </p>
      ) : balances.isError ? (
        <p role="alert" className="text-destructive">
          {balances.error.message}
        </p>
      ) : balances.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading balances…
        </p>
      ) : balances.data.length === 0 ? (
        <p role="status" className="text-muted-foreground">
          No balances yet.
        </p>
      ) : (
        // Two columns from 862px: each box's content is 410px wide (amount group, gap, Swap and Send), plus the 42px gap.
        <ul className="grid grid-cols-1 md:gap-y-4.5 @min-[862px]:grid-cols-2 @min-[862px]:gap-x-10.5">
          {balances.data.map((balance) => (
            <li key={`${balance.networkName}:${balance.tokenType}`}>
              <BalanceBox balance={balance} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
