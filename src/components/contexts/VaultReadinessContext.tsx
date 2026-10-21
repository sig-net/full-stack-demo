'use client'

import { skipToken, useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'

import { useCaller } from '@/components/contexts/CallerContext'
import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import {
  type BalanceCheck,
  CALLER_DUST_MINIMUM,
  type ReadinessChecks,
  readBalanceCheck,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { getVaultInitialisation, getVaultReadiness } from '@/server/actions/readiness-actions'

export interface VaultReadinessContextValue {
  /** The vault's initialisation and every payer's check. A check whose read has not run, or cannot run yet, is unavailable with the reason. */
  readonly checks: ReadinessChecks
  /** True while any check is being read. */
  readonly checking: boolean
  /** When a check was last read, from either source, in epoch milliseconds, or null before the first read. */
  readonly checkedAt: number | null
  /** Reads every check again, whatever its age. */
  readonly recheck: () => Promise<void>
}

const VaultReadinessContext = createContext<VaultReadinessContextValue | null>(null)

/**
 * Owns the readiness reads: the caller's DUST from the connected wallet, which only the browser
 * can read, and the backend's checks for the identity secret's caller. Each read runs once its
 * input exists and again only on `recheck`, since every read costs a chain or wallet round trip.
 */
export function VaultReadinessProvider({ children }: { children: ReactNode }): ReactNode {
  const { midnightNetwork } = useConfig()
  const { wallet, addresses, generation } = useMidnightWallet()
  const { callerSecret, callerName } = useCaller()
  const dustAccount = addresses?.unshieldedAddress
  const initialisation = useQuery({
    queryKey: ['vault-initialisation', midnightNetwork.networkId, callerName],
    queryFn:
      callerSecret === null
        ? skipToken
        : async () => {
            const result = await getVaultInitialisation(callerSecret, {})
            if (!result.ok) throw new Error(result.error)
            return result.initialisation
          },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
  const callerDust = useQuery({
    queryKey: ['caller-dust', midnightNetwork.networkId, generation],
    queryFn:
      wallet === null || dustAccount === undefined
        ? skipToken
        : () =>
            readBalanceCheck('DUST', dustAccount, async () => ({
              available: await wallet.getDustBalance(),
              required: CALLER_DUST_MINIMUM,
            })),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
  const backend = useQuery({
    queryKey: ['vault-readiness', midnightNetwork.networkId, callerName],
    queryFn:
      callerSecret === null
        ? skipToken
        : async () => {
            const result = await getVaultReadiness(callerSecret, {})
            if (!result.ok) throw new Error(result.error)
            return result.readiness
          },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
  const backendReason =
    callerSecret === null
      ? 'No identity secret is set.'
      : backend.status === 'error'
        ? backend.error.message
        : NOT_CHECKED
  const checks: ReadinessChecks = {
    vaultInitialised: initialisation.data ?? {
      status: 'unavailable',
      reason:
        callerSecret === null
          ? 'No identity secret is set.'
          : initialisation.status === 'error'
            ? initialisation.error.message
            : NOT_CHECKED,
    },
    callerDust:
      callerDust.data ??
      unavailable(
        'DUST',
        wallet === null
          ? 'No Midnight wallet is connected.'
          : dustAccount === undefined
            ? 'The wallet has not derived its addresses yet.'
            : NOT_CHECKED,
      ),
    relayerDust: backend.data?.relayerDust ?? unavailable('DUST', backendReason),
    depositAccountEth: backend.data?.depositAccountEth ?? unavailable('ETH', backendReason),
    vaultAccountEth: backend.data?.vaultAccountEth ?? unavailable('ETH', backendReason),
  }
  // A query without its input is skipped, and refetching a skipped query is a reported error.
  const recheck = async (): Promise<void> => {
    await Promise.all([
      wallet === null || dustAccount === undefined ? undefined : callerDust.refetch(),
      callerSecret === null ? undefined : backend.refetch(),
      callerSecret === null ? undefined : initialisation.refetch(),
    ])
  }
  return (
    <VaultReadinessContext
      value={{
        checks,
        checking: callerDust.isFetching || backend.isFetching || initialisation.isFetching,
        checkedAt: latestReadAt(
          callerDust.dataUpdatedAt,
          backend.dataUpdatedAt,
          initialisation.dataUpdatedAt,
        ),
        recheck,
      }}
    >
      {children}
    </VaultReadinessContext>
  )
}

const NOT_CHECKED = 'Not checked yet.'

/** React Query reports a query that never ran as updated at zero. */
function latestReadAt(...updatedAt: number[]): number | null {
  const latest = Math.max(...updatedAt)
  return latest === 0 ? null : latest
}

function unavailable(asset: BalanceCheck['asset'], reason: string): BalanceCheck {
  return { status: 'unavailable', asset, account: '', reason }
}

export function useVaultReadiness(): VaultReadinessContextValue {
  const value = useContext(VaultReadinessContext)
  if (value === null) {
    throw new Error('useVaultReadiness must be used inside VaultReadinessProvider')
  }
  return value
}
