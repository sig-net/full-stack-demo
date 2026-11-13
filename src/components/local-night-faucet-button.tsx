'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, WandSparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NATIVE_BALANCES_QUERY_KEY } from '@/components/use-native-balances'
import { isLocalEnvironment } from '@/lib/config/local-environment'
import { NIGHT_FAUCET_AMOUNT } from '@/lib/midnight/local-faucet-v1/local-midnight-faucet-service'
import { NIGHT_DECIMALS } from '@/lib/midnight/wallet/native-balances'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { fundNight } from '@/server/actions/local-midnight-faucet-actions'

/**
 * The wand that sends the connected wallet NIGHT from the local faucet, then reads the balances
 * and readiness again. It renders on the local stack only, where the faucet exists; a host must
 * provide the tooltip.
 */
export function LocalNightFaucetButton(): ReactNode {
  const config = useConfig()
  const { wallet } = useMidnightWallet()
  const { recheck } = useVaultReadiness()
  const queryClient = useQueryClient()
  const funding = useMutation({
    mutationFn: async () => {
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      const result = await fundNight({ unshieldedAddress: wallet.addresses.unshieldedAddress })
      if (!result.ok) throw new Error(result.error)
      return result.funding
    },
    onSuccess: async (sent) => {
      toast.success(
        `Sent ${formatTokenAmount(sent.amount, NIGHT_DECIMALS)} NIGHT to the wallet. It shows once the wallet has synced.`,
      )
      await queryClient.invalidateQueries({ queryKey: [NATIVE_BALANCES_QUERY_KEY] })
      await recheck()
    },
    onError: (error) => {
      toast.error(`Funding with NIGHT failed: ${error.message}`)
    },
  })
  if (!isLocalEnvironment(config) || wallet === null) return null
  if (funding.isPending) {
    return <LoaderCircle className="size-4 animate-spin" aria-label="Funding with NIGHT" />
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={FUND_LABEL}
            onClick={() => {
              funding.mutate()
            }}
          />
        }
      >
        <WandSparkles />
      </TooltipTrigger>
      <TooltipContent>{FUND_LABEL}</TooltipContent>
    </Tooltip>
  )
}

const FUND_LABEL = `Fund with ${formatTokenAmount(NIGHT_FAUCET_AMOUNT, NIGHT_DECIMALS)} NIGHT from the local faucet`
