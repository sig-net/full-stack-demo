'use client'

import { skipToken, useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'

import { useCaller } from '@/components/contexts/CallerContext'
import { useConfig } from '@/components/contexts/ConfigContext'
import type {
  ReadinessCheck,
  VaultReadiness,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { getVaultReadiness } from '@/server/actions/readiness-actions'

export interface VaultReadinessContextValue {
  /** Every payer's check. A check whose read has not run, or cannot run yet, is unavailable with the reason. */
  readonly checks: VaultReadiness
  /** True while any check is being read. */
  readonly checking: boolean
  /** When the backend's checks were last read, in epoch milliseconds, or null before the first read. */
  readonly checkedAt: number | null
  /** Reads every check again, whatever its age. */
  readonly recheck: () => Promise<void>
}

const VaultReadinessContext = createContext<VaultReadinessContextValue | null>(null)

/**
 * Owns the backend's readiness reads for the identity secret's caller. The read runs once the
 * secret exists and again only on `recheck`, since every read costs a chain round trip.
 */
export function VaultReadinessProvider({ children }: { children: ReactNode }): ReactNode {
  const { midnightNetwork } = useConfig()
  const { callerSecret, callerName } = useCaller()
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
  const checks: VaultReadiness = {
    relayerDust: backend.data?.relayerDust ?? unavailable('DUST', backendReason),
    depositAccountEth: backend.data?.depositAccountEth ?? unavailable('ETH', backendReason),
    vaultAccountEth: backend.data?.vaultAccountEth ?? unavailable('ETH', backendReason),
  }
  // A query without its input is skipped, and refetching a skipped query is a reported error.
  const recheck = async (): Promise<void> => {
    if (callerSecret !== null) await backend.refetch()
  }
  return (
    <VaultReadinessContext
      value={{
        checks,
        checking: backend.isFetching,
        checkedAt: backend.dataUpdatedAt === 0 ? null : backend.dataUpdatedAt,
        recheck,
      }}
    >
      {children}
    </VaultReadinessContext>
  )
}

const NOT_CHECKED = 'Not checked yet.'

function unavailable(asset: ReadinessCheck['asset'], reason: string): ReadinessCheck {
  return { status: 'unavailable', asset, account: '', reason }
}

export function useVaultReadiness(): VaultReadinessContextValue {
  const value = useContext(VaultReadinessContext)
  if (value === null) {
    throw new Error('useVaultReadiness must be used inside VaultReadinessProvider')
  }
  return value
}
