'use client'

import { Download, Upload } from 'lucide-react'
import type { ReactNode } from 'react'

import { TokenAmountField } from '@/components/token-amount-field'
import { Button } from '@/components/ui/button'

/**
 * The lending leg of the vault, Aave's static wrapper, as the place its Supply and Redeem
 * controls will live. Both actions are drawn and disabled: nothing behind them is wired yet.
 */
export function LendPanel(): ReactNode {
  return (
    <section aria-labelledby="lend-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col items-center gap-5 border-[0.5px] bg-linear-to-b from-swap-panel-from to-swap-panel-to p-[39.5px] md:border-x-0 md:border-y md:p-9.75">
        <h2 id="lend-title" className="text-base/6 font-medium text-swap-panel-foreground">
          Lend on Aave
        </h2>
        <LendAction label="Supply" Icon={Upload} />
        <LendAction label="Redeem" Icon={Download} />
        <p role="status" className="self-stretch text-sm text-muted-foreground">
          Lending is not wired up yet.
        </p>
      </div>
    </section>
  )
}

/** One lending action: its amount field and its control, both waiting for their wiring. */
function LendAction({ label, Icon }: { label: string; Icon: typeof Upload }): ReactNode {
  return (
    <div className="flex flex-col gap-3 self-stretch">
      <h3 className="text-sm/5 font-semibold text-swap-panel-foreground">{label}</h3>
      <TokenAmountField
        label={label}
        amount=""
        tokens={[]}
        token={null}
        onTokenChange={() => undefined}
        disabled
      />
      <Button variant="pink" size="xl" disabled className="w-full">
        <Icon aria-hidden />
        <span className="px-0.5">{label}</span>
      </Button>
    </div>
  )
}
