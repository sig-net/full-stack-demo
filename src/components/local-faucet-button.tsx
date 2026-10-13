'use client'

import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, WandSparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isLocalEnvironment } from '@/lib/config/local-environment'
import { fundAccount } from '@/server/actions/local-faucet-actions'

/**
 * The wand that gives an account one ETH from the local faucet and reads readiness again. It
 * renders on the local stack only, where the faucet exists; a host must provide the tooltip.
 */
export function LocalFaucetButton({ account }: { account: string }): ReactNode {
  const config = useConfig()
  const { recheck } = useVaultReadiness()
  const funding = useMutation({
    mutationFn: async () => {
      const result = await fundAccount({ account })
      if (!result.ok) throw new Error(result.error)
      return result.funding
    },
    onSuccess: () => recheck(),
  })
  if (!isLocalEnvironment(config)) return null
  if (funding.isPending)
    return <LoaderCircle className="size-4 animate-spin" aria-label="Funding" />
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Fund with 1 ETH from the local faucet"
              onClick={() => {
                funding.mutate()
              }}
            />
          }
        >
          <WandSparkles />
        </TooltipTrigger>
        <TooltipContent>Fund with 1 ETH from the local faucet</TooltipContent>
      </Tooltip>
      {funding.isError && <span role="alert">{funding.error.message}</span>}
    </>
  )
}
