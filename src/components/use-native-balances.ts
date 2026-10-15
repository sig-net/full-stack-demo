'use client'

import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { type NativeBalances, readNativeBalances } from '@/lib/midnight/wallet/native-balances'

const NATIVE_BALANCES_REFETCH_INTERVAL_MS = 10_000

/** The connected wallet's NIGHT and DUST, scoped to the wallet generation, read every ten seconds. */
export function useNativeBalances(): UseQueryResult<NativeBalances> {
  const { midnightNetwork } = useConfig()
  const { wallet, generation } = useMidnightWallet()
  return useQuery({
    queryKey: ['native-balances', midnightNetwork.networkId, generation],
    queryFn: wallet === null ? skipToken : () => readNativeBalances(wallet),
    refetchInterval: NATIVE_BALANCES_REFETCH_INTERVAL_MS,
  })
}
