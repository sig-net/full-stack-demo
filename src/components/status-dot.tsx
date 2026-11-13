import { cn } from 'cn'
import type { ReactNode } from 'react'

const TONES = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  /** The text colour of the label it sits beside. */
  current: 'bg-current',
} as const

/** A decorative marker beside a status label. The label carries the meaning, the dot repeats it. */
export function StatusDot({ tone }: { tone: keyof typeof TONES }): ReactNode {
  return <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', TONES[tone])} />
}
