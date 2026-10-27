'use client'

import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ethereumExplorerOf } from '@/lib/config/ethereum-explorer'

interface EthereumAccountLinkProps {
  /** The account, in any letter case. */
  account: string
  /** Names the account in the accessible label, such as `deposit account`. */
  label: string
}

/** Opens the account's page on the configured chain's explorer in a new tab, or nothing when the chain has no explorer. */
export function EthereumAccountLink({ account, label }: EthereumAccountLinkProps): ReactNode {
  const explorer = ethereumExplorerOf(useConfig())
  if (explorer === null) return null
  const title = `Open the ${label} on ${explorer.name}`
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              nativeButton={false}
              aria-label={title}
              render={<a href={explorer.addressURL(account)} target="_blank" rel="noreferrer" />}
            />
          }
        >
          <ExternalLink />
        </TooltipTrigger>
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
