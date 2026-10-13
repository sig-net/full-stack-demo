'use client'

import type { ReactNode } from 'react'

import { CopyButton } from '@/components/copy-button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { abbreviateAddress } from '@/lib/midnight/abbreviate-address'

interface AddressIdentifierProps {
  /** Names the address in the copy button's accessible label. */
  label: string
  address: string
}

/** Shows an abbreviated address, the full value on hover or focus, and a copy button. */
export function AddressIdentifier({ label, address }: AddressIdentifierProps): ReactNode {
  return (
    <span className="flex items-center gap-1">
      <CopyButton label={label} value={address} />
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0} className="font-mono text-xs" />}>
          {abbreviateAddress(address)}
        </TooltipTrigger>
        <TooltipContent className="max-w-md font-mono break-all">{address}</TooltipContent>
      </Tooltip>
    </span>
  )
}
