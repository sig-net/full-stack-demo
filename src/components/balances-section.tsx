'use client'

import { Download, EyeOff, type LucideIcon, Wallet } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { BalanceBox } from '@/components/balance-box'
import { useCaller } from '@/components/contexts/CallerContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { DepositDialog } from '@/components/deposit-dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMidnightBalances } from '@/components/use-midnight-balances'
import { type DepositPrerequisite, missingDepositPrerequisites } from '@/lib/deposit-prerequisites'
import { walletConnectionStatus } from '@/lib/midnight/wallet/connection-status'

export function BalancesSection(): ReactNode {
  const connection = useMidnightWallet()
  const { callerSecret, depositAccount } = useCaller()
  const [depositOpen, setDepositOpen] = useState(false)
  const { wallet } = connection
  const status = walletConnectionStatus(connection)
  const missing = missingDepositPrerequisites({
    walletConnected: wallet !== null,
    identitySecretSet: callerSecret !== null,
  })
  const depositButton = (
    <Button
      size="lg"
      disabled={missing.length > 0}
      onClick={() => {
        setDepositOpen(true)
      }}
    >
      <Download aria-hidden />
      <span className="px-0.5">Deposit</span>
    </Button>
  )
  const balances = useMidnightBalances()
  return (
    <section aria-labelledby="balances-title" className="@container flex flex-col gap-4 md:gap-4.5">
      <div className="flex items-start justify-between border-t border-section-rule pt-5 pb-5.25">
        <h2
          id="balances-title"
          className="text-base/4.5 font-bold tracking-widest text-subtle-foreground uppercase"
        >
          Balances
        </h2>
        {missing.length === 0 ? (
          depositButton
        ) : (
          // A disabled button takes no pointer events, so the wrapper is the hover, tap and focus
          // target, and a popover rather than a tooltip opens on the tap a disabled button invites.
          <Popover>
            <PopoverTrigger
              openOnHover
              delay={0}
              nativeButton={false}
              render={<span tabIndex={0} className="inline-flex rounded-xs" />}
            >
              {depositButton}
            </PopoverTrigger>
            <PopoverContent side="top" className="w-auto max-w-xs">
              <DepositPrerequisitesMessage missing={missing} />
            </PopoverContent>
          </Popover>
        )}
      </div>
      {depositOpen && depositAccount !== null && (
        <DepositDialog open onOpenChange={setDepositOpen} address={depositAccount} />
      )}
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

/** A checklist of what a deposit still needs, each item with the icon of its app bar control. */
function DepositPrerequisitesMessage({ missing }: { missing: DepositPrerequisite[] }): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium">To Deposit:</p>
      <ul className="flex flex-col gap-1">
        {missing.map((prerequisite) => {
          const { Icon, label } = DEPOSIT_PREREQUISITE_ITEMS[prerequisite]
          return (
            <li key={prerequisite} className="flex items-center gap-1.5">
              <Icon aria-hidden className="size-4 shrink-0" />
              {label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const DEPOSIT_PREREQUISITE_ITEMS: Record<DepositPrerequisite, { Icon: LucideIcon; label: string }> =
  {
    wallet: { Icon: Wallet, label: 'connect wallet' },
    identitySecret: { Icon: EyeOff, label: 'set identity secret' },
  }
