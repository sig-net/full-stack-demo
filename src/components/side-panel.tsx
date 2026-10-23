'use client'

import { type ReactNode, useState } from 'react'

import { LendPanel } from '@/components/lend-panel'
import { SwapPanel, type SwapSourceRequest } from '@/components/swap-panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const SIDE_PANEL_TABS = ['swap', 'lend'] as const

type SidePanelTab = (typeof SIDE_PANEL_TABS)[number]

interface SidePanelProps {
  /** The latest request from a balance's Swap control, which also brings the Swap tab to the front. */
  sourceRequest: SwapSourceRequest | null
}

/**
 * The right column's two panels behind two line blocks, Swap and Lend, drawn as the design
 * draws them: full width, the open one filled. The user's pick is tagged with the swap request
 * it followed, so a newer request opens Swap over it.
 */
export function SidePanel({ sourceRequest }: SidePanelProps): ReactNode {
  const [choice, setChoice] = useState<{ tab: SidePanelTab; after: number }>({
    tab: 'swap',
    after: 0,
  })
  const tab: SidePanelTab =
    sourceRequest !== null && sourceRequest.sequence > choice.after ? 'swap' : choice.tab
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isSidePanelTab(value)) setChoice({ tab: value, after: sourceRequest?.sequence ?? 0 })
      }}
      className="gap-0"
    >
      <TabsList className="grid h-auto w-full grid-cols-2 gap-0 rounded-none border-[0.5px] bg-transparent p-0 group-data-horizontal/tabs:h-auto md:border-x-0 md:border-t md:border-b-0">
        {SIDE_PANEL_TABS.map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            className="h-15 rounded-none border-0 border-border text-xl/6 font-semibold text-swap-panel-foreground transition-colors hover:bg-pink/40 hover:text-swap-panel-foreground data-active:bg-pink data-active:text-swap-panel-foreground data-active:shadow-none dark:data-active:border-0 dark:data-active:bg-pink [&+&]:border-l-[0.5px]"
          >
            {SIDE_PANEL_LABELS[option]}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="swap" className="flex min-h-0 flex-col">
        <SwapPanel sourceRequest={sourceRequest} />
      </TabsContent>
      <TabsContent value="lend" className="flex min-h-0 flex-col">
        <LendPanel />
      </TabsContent>
    </Tabs>
  )
}

const SIDE_PANEL_LABELS: Record<SidePanelTab, string> = { swap: 'Swap', lend: 'Lend' }

function isSidePanelTab(value: unknown): value is SidePanelTab {
  return SIDE_PANEL_TABS.some((option) => option === value)
}
