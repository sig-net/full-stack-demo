'use client'

import {
  skipToken,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { CircleCheck, CircleCheckBig, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  NATIVE_BALANCES_QUERY_KEY,
  NATIVE_BALANCES_REFETCH_INTERVAL_MS,
  useNativeBalances,
} from '@/components/use-native-balances'
import { explainDustSpendRejection } from '@/lib/midnight/wallet/dust-spend-rejection'
import { isSeedWallet } from '@/lib/midnight/wallet/is-seed-wallet'
import { NIGHT_DECIMALS } from '@/lib/midnight/wallet/native-balances'
import { messageOf } from '@/lib/message-of'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'

/**
 * The tick that registers the seed wallet's NIGHT for DUST generation: a spinner while a
 * registration is in flight, a control while any available NIGHT is unregistered, a mark once all
 * of it is, nothing without NIGHT. It renders for the seed wallet only, the one wallet that
 * registers NIGHT in the page; a browser wallet registers in its own interface. A host must
 * provide the tooltip.
 */
export function RegisterNightButton(): ReactNode {
  const { midnightNetwork } = useConfig()
  const { wallet, generation } = useMidnightWallet()
  const seedWallet = wallet !== null && isSeedWallet(wallet) ? wallet : null
  const balances = useNativeBalances()
  const unregistered = useQuery({
    // Under the native balances key, so a control that invalidates those reads invalidates this one.
    queryKey: [
      NATIVE_BALANCES_QUERY_KEY,
      'unregistered-night',
      midnightNetwork.networkId,
      generation,
    ],
    queryFn: seedWallet === null ? skipToken : () => seedWallet.getUnregisteredNightBalance(),
    refetchInterval: NATIVE_BALANCES_REFETCH_INTERVAL_MS,
  })
  const { recheck } = useVaultReadiness()
  const queryClient = useQueryClient()
  // Keyed in the shared mutation cache, so every mount sees a registration another mount started.
  const mutationKey = [REGISTER_NIGHT_MUTATION_KEY, midnightNetwork.networkId, generation]
  const inFlight = useIsMutating({ mutationKey }) > 0
  const registering = useMutation({
    mutationKey,
    mutationFn: async () => {
      if (seedWallet === null) throw new Error('The connected wallet cannot register NIGHT.')
      return seedWallet.registerNightForDust()
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
  if (seedWallet === null) return null
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
  if (balances.data === undefined || unregistered.data === undefined) return null
  if (balances.data.night === 0n) return null
  if (unregistered.data === 0n) {
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
  const label = `Register ${formatTokenAmount(unregistered.data, NIGHT_DECIMALS)} NIGHT for DUST generation`
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
