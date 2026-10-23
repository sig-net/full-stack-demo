'use client'

import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** An info icon that shows `children` in a tooltip on hover and keyboard focus, inside a `TooltipProvider`. */
export function InfoTip({
  label,
  size = 'sm',
  children,
}: {
  /** The accessible name of the icon, saying what the tip explains. */
  label: string
  size?: InfoTipSize
  children: ReactNode
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={0} className="inline-flex rounded-md" />}
        aria-label={label}
      >
        <Info aria-hidden className={ICON_CLASS_BY_SIZE[size]} />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{children}</TooltipContent>
    </Tooltip>
  )
}

export type InfoTipSize = 'sm' | 'md'

const ICON_CLASS_BY_SIZE: Record<InfoTipSize, string> = {
  sm: 'size-3.5',
  md: 'size-4',
}
