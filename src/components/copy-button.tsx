'use client'

import { Check, Copy, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface CopyButtonProps {
  /** Names the value in the accessible label and the result announcement. */
  label: string
  value: string
}

/** Copies `value` to the clipboard and shows the result on the icon for a moment. */
export function CopyButton({ label, value }: CopyButtonProps): ReactNode {
  const [copy, setCopy] = useState<CopyState>('idle')
  const copyLabel = {
    idle: `Copy ${label}`,
    copied: `${label} copied`,
    failed: `Copying ${label} failed`,
  }[copy]
  const showResult = (state: CopyState): void => {
    setCopy(state)
    setTimeout(() => {
      setCopy('idle')
    }, FEEDBACK_MS)
  }
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={copyLabel}
        onClick={() => {
          navigator.clipboard.writeText(value).then(
            () => {
              showResult('copied')
            },
            () => {
              showResult('failed')
            },
          )
        }}
      >
        {copy === 'copied' ? <Check /> : copy === 'failed' ? <X /> : <Copy />}
      </Button>
      <span role="status" className="sr-only">
        {copy === 'idle' ? '' : copyLabel}
      </span>
    </>
  )
}

type CopyState = 'idle' | 'copied' | 'failed'

const FEEDBACK_MS = 1500
