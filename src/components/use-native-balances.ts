'use client'

import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { type NativeBalances, readNativeBalances } from '@/lib/midnight/wallet/native-balances'

const NATIVE_BALANCES_REFETCH_INTERVAL_MS = 10_000

/** The first key segment, for a control that changed a balance to invalidate the read. */
export const NATIVE_BALANCES_QUERY_KEY = 'native-balances'

/** The connected wallet's NIGHT, DUST and unregistered NIGHT, scoped to the wallet generation, read every ten seconds. */
export function useNativeBalances(): UseQueryResult<NativeBalances> {
  const { midnightNetwork } = useConfig()
  const { wallet, generation } = useMidnightWallet()
  return useQuery({
    queryKey: [NATIVE_BALANCES_QUERY_KEY, midnightNetwork.networkId, generation],
    queryFn: wallet === null ? skipToken : () => readNativeBalances(wallet),
    refetchInterval: NATIVE_BALANCES_REFETCH_INTERVAL_MS,
  })
}
