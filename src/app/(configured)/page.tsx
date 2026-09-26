import type { ReactNode } from 'react'

import { ActivitySection } from '@/components/activity-section'
import { BalancesSection } from '@/components/balances-section'
import { HomeLayout } from '@/components/home-layout'
import { SwapPanel } from '@/components/swap-panel'

export default function HomePage(): ReactNode {
  return (
    <HomeLayout
      balances={<BalancesSection />}
      activity={<ActivitySection />}
      swap={<SwapPanel />}
    />
  )
}
