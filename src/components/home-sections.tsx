'use client'

import { type ReactNode, useState } from 'react'

import { ActivitySection } from '@/components/activity-section'
import { BalancesSection } from '@/components/balances-section'
import { HomeLayout } from '@/components/home-layout'
import { SwapPanel, type SwapSourceRequest } from '@/components/swap-panel'

/**
 * The home page's sections, with the one thing two of them share: a balance's Swap control asks
 * the swap panel to sell that token, so the request is owned here, above both.
 */
export function HomeSections(): ReactNode {
  const [swapSource, setSwapSource] = useState<SwapSourceRequest | null>(null)
  return (
    <HomeLayout
      balances={
        <BalancesSection
          onSwap={(erc20Address) => {
            setSwapSource({ erc20Address, sequence: (swapSource?.sequence ?? 0) + 1 })
          }}
        />
      }
      activity={<ActivitySection types={['Deposit', 'Withdraw', 'Swap']} />}
      swap={<SwapPanel sourceRequest={swapSource} />}
    />
  )
}
