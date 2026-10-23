'use client'

import { LoaderCircle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** Reads every readiness check again, and spins in place while the reads run. */
export function ReadinessRecheckButton({ disabled = false }: { disabled?: boolean }): ReactNode {
  const { checking, recheck } = useVaultReadiness()
  if (checking) return <LoaderCircle className="size-4 animate-spin" aria-label="Checking" />
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Check again"
              disabled={disabled}
              onClick={() => {
                void recheck()
              }}
            />
          }
        >
          <RefreshCw />
        </TooltipTrigger>
        <TooltipContent>Check again</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
