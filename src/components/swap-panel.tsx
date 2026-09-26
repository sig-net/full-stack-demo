'use client'

import { ArrowDown, SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { SwapAmountField } from '@/components/swap-amount-field'
import { Button } from '@/components/ui/button'
import { type DummySwapToken, dummySwapTokens } from '@/lib/swap/dummy-swap-tokens'

const AMOUNT_INPUT = /^\d*\.?\d*$/

export function SwapPanel(): ReactNode {
  const [fromAmount, setFromAmount] = useState('')
  const [fromToken, setFromToken] = useState<DummySwapToken | null>(null)
  const [toAmount, setToAmount] = useState('')
  const [toToken, setToToken] = useState<DummySwapToken | null>(null)

  return (
    <section aria-labelledby="swap-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col items-center gap-5 border-[0.5px] bg-linear-to-b from-swap-panel-from to-swap-panel-to p-[39.5px] md:border-x-0 md:border-y md:p-9.75">
        <div className="flex h-8 items-center justify-between self-stretch">
          <h2 id="swap-title" className="text-xl/6 font-semibold text-swap-panel-foreground">
            Swap
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Swap settings"
            className="size-8 text-swap-panel-icon"
          >
            <SlidersHorizontal aria-hidden="true" strokeWidth={1.5} className="size-8" />
          </Button>
        </div>
        <SwapAmountField
          label="From"
          amount={fromAmount}
          onAmountChange={(amount) => {
            if (AMOUNT_INPUT.test(amount)) setFromAmount(amount)
          }}
          tokens={dummySwapTokens}
          token={fromToken}
          onTokenChange={setFromToken}
        />
        <ArrowDown aria-hidden="true" className="size-5 shrink-0 text-swap-panel-icon" />
        <SwapAmountField
          label="To"
          amount={toAmount}
          onAmountChange={(amount) => {
            if (AMOUNT_INPUT.test(amount)) setToAmount(amount)
          }}
          tokens={dummySwapTokens}
          token={toToken}
          onTokenChange={setToToken}
        />
        <Button variant="pink" size="xl" disabled className="w-full">
          <span className="px-0.5">Swap</span>
        </Button>
      </div>
    </section>
  )
}
