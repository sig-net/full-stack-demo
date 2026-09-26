'use client'

import { Check, Copy, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { abbreviateAddress } from '@/lib/midnight/abbreviate-address'

const FEEDBACK_MS = 1500

type CopyState = 'idle' | 'copied' | 'failed'

interface AddressIdentifierProps {
  /** Names the address in the copy button's accessible label. */
  label: string
  address: string
}

/** Shows an abbreviated address, the full value on hover or focus, and a copy button. */
export function AddressIdentifier({ label, address }: AddressIdentifierProps): ReactNode {
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
    <span className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={copyLabel}
        onClick={() => {
          navigator.clipboard.writeText(address).then(
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
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0} className="font-mono text-xs" />}>
          {abbreviateAddress(address)}
        </TooltipTrigger>
        <TooltipContent className="max-w-md font-mono break-all">{address}</TooltipContent>
      </Tooltip>
      <span role="status" className="sr-only">
        {copy === 'idle' ? '' : copyLabel}
      </span>
    </span>
  )
}
