'use client'

import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import {
  type MidnightBalanceAmount,
  readMidnightBalanceAmounts,
} from '@/lib/balances/midnight-balances'

const BALANCES_REFETCH_INTERVAL_MS = 10_000

/** The connected wallet's shielded balances, scoped to the wallet generation and the registry, read every ten seconds. */
export function useMidnightBalances(): UseQueryResult<MidnightBalanceAmount[]> {
  const { midnightNetwork } = useConfig()
  const { wallet, generation } = useMidnightWallet()
  const registry = useTokenInfoRegistry()
  return useQuery({
    queryKey: ['midnight-balances', midnightNetwork.networkId, generation, registry.fingerprint],
    queryFn: wallet === null ? skipToken : () => readMidnightBalanceAmounts(wallet, registry),
    refetchInterval: BALANCES_REFETCH_INTERVAL_MS,
  })
}
