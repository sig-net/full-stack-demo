'use client'

import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleCheckBig, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NATIVE_BALANCES_QUERY_KEY, useNativeBalances } from '@/components/use-native-balances'
import { explainDustSpendRejection } from '@/lib/midnight/wallet/dust-spend-rejection'
import { NIGHT_DECIMALS } from '@/lib/midnight/wallet/native-balances'
import { messageOf } from '@/lib/message-of'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'

/**
 * The tick that registers the connected wallet's NIGHT for DUST generation: a spinner while a
 * registration is in flight, a control while any available NIGHT is unregistered, a mark once all
 * of it is, nothing without available NIGHT or for a wallet that cannot observe registration. A
 * host must provide the tooltip.
 */
export function RegisterNightButton(): ReactNode {
  const { midnightNetwork } = useConfig()
  const { wallet, generation } = useMidnightWallet()
  const balances = useNativeBalances()
  const { recheck } = useVaultReadiness()
  const queryClient = useQueryClient()
  // Keyed in the shared mutation cache, so every mount sees a registration another mount started.
  const mutationKey = [REGISTER_NIGHT_MUTATION_KEY, midnightNetwork.networkId, generation]
  const inFlight = useIsMutating({ mutationKey }) > 0
  const registering = useMutation({
    mutationKey,
    mutationFn: async () => {
      if (wallet?.registerNightForDust === undefined) {
        throw new Error('The connected wallet cannot register NIGHT.')
      }
      return wallet.registerNightForDust()
    },
    onSuccess: async (registered) => {
      toast.success(
        `Registered ${formatTokenAmount(registered, NIGHT_DECIMALS)} NIGHT for DUST generation. DUST accrues from now.`,
      )
      await queryClient.invalidateQueries({ queryKey: [NATIVE_BALANCES_QUERY_KEY] })
      await recheck()
    },
    onError: (error) => {
      toast.error(`Registering NIGHT failed: ${explainDustSpendRejection(messageOf(error))}`)
    },
  })
  if (wallet?.registerNightForDust === undefined) return null
  if (inFlight) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span tabIndex={0} className="inline-flex rounded-md" />}
          aria-label={REGISTERING_LABEL}
        >
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        </TooltipTrigger>
        <TooltipContent>{REGISTERING_LABEL}</TooltipContent>
      </Tooltip>
    )
  }
  if (balances.data === undefined) return null
  const { availableNight, unregisteredNight } = balances.data
  if (unregisteredNight === null || availableNight === 0n) return null
  if (unregisteredNight === 0n) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span tabIndex={0} className="inline-flex rounded-md" />}
          aria-label={REGISTERED_LABEL}
        >
          <CircleCheckBig aria-hidden className="size-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>{REGISTERED_LABEL}</TooltipContent>
      </Tooltip>
    )
  }
  const label = `Register ${formatTokenAmount(unregisteredNight, NIGHT_DECIMALS)} NIGHT for DUST generation`
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            onClick={() => {
              registering.mutate()
            }}
          />
        }
      >
        <CircleCheck />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const REGISTER_NIGHT_MUTATION_KEY = 'register-night'
const REGISTERING_LABEL =
  'Registering NIGHT: waiting for its DUST to cover the fee, then for the wallet to synchronise the block'
const REGISTERED_LABEL = 'All NIGHT is registered for DUST generation'
