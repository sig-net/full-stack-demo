'use client'

import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import type { CallerLogin } from '@/lib/caller/wallet-login'
import {
  type LoginStatus,
  loginStatusOf,
  walletLoginQueryOptions,
} from '@/lib/caller/wallet-login-query'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import {
  userCommitmentOf,
  vaultSecretSchema,
} from '@/lib/midnight/ethereum-erc20-vault/vault-secret'
import { vaultSecretStorage } from '@/lib/midnight/ethereum-erc20-vault/vault-secret-storage'

export interface CallerContextValue {
  /** The connected wallet's login, whose credential every server action takes first. Null unless `loginStatus` is `signed`. */
  readonly login: CallerLogin | null
  readonly loginStatus: LoginStatus
  /** Why the connected wallet's login signature was refused, or null. */
  readonly loginError: string | null
  /** Asks the wallet to sign again after a refusal. */
  readonly retryLogin: () => void
  /** The vault secret every caller circuit is built with, lower-case hex without `0x`. Null until set. */
  readonly vaultSecret: string | null
  /** The contract's commitment of the vault secret in hex, which the server derives the deposit account from. Null until the secret is set. */
  readonly userCommitment: string | null
  /** The EVM account the caller's deposits are swept from, derived here from the commitment and the public configuration. Null until the secret is set. */
  readonly depositAccount: string | null
  /** True until the stored secret has been read on first load. */
  readonly restoring: boolean
  /** Why the last secret was refused or the stored one discarded. */
  readonly error: string | null
  readonly setVaultSecret: (secret: string) => void
  readonly clearVaultSecret: () => void
}

const CallerContext = createContext<CallerContextValue | null>(null)

/**
 * Logs the caller in with the connected wallet and holds the vault secret for the page. The
 * login is signed once per wallet generation and kept in page memory only, so a disconnect or
 * a reload asks the wallet again. The secret lives in local storage until it is cleared, so a
 * reload keeps the same vault account, and a stored value the schema rejects counts as unset
 * until a new one replaces it.
 */
export function CallerProvider({ children }: { children: ReactNode }): ReactNode {
  const { midnightNetwork, midnightSignet, midnightEthereumErc20Vault } = useConfig()
  const { wallet, generation } = useMidnightWallet()
  const [refusal, setRefusal] = useState<string | null>(null)
  const loginQuery = useQuery(
    walletLoginQueryOptions(wallet, midnightNetwork.networkId, generation),
  )
  const loginStatus = loginStatusOf(wallet !== null, loginQuery.status)
  // Undefined only while server rendering and hydrating, before the store has been read.
  const stored = useSyncExternalStore(
    vaultSecretStorage.subscribe,
    vaultSecretStorage.read,
    () => undefined,
  )
  const parsed =
    stored === undefined || stored === null ? null : vaultSecretSchema.safeParse(stored)
  const vaultSecret = parsed?.success === true ? parsed.data : null
  const error =
    parsed?.success === false
      ? 'The saved vault secret is not 32 bytes in hex: set a new one.'
      : refusal
  const userCommitment = vaultSecret === null ? null : userCommitmentOf(vaultSecret)
  const depositAccount =
    userCommitment === null
      ? null
      : depositAccountOf(userCommitment, midnightSignet, midnightEthereumErc20Vault)

  const setVaultSecret = (value: string): void => {
    const candidate = vaultSecretSchema.safeParse(value)
    if (!candidate.success) {
      setRefusal('The vault secret must be 32 bytes in hex.')
      return
    }
    setRefusal(null)
    vaultSecretStorage.write(candidate.data)
  }

  const clearVaultSecret = (): void => {
    setRefusal(null)
    vaultSecretStorage.clear()
  }

  return (
    <CallerContext.Provider
      value={{
        login: loginStatus === 'signed' ? (loginQuery.data ?? null) : null,
        loginStatus,
        loginError: loginQuery.status === 'error' ? loginQuery.error.message : null,
        retryLogin: () => {
          // A query without its wallet is skipped, and refetching a skipped query is a reported error.
          if (wallet !== null) void loginQuery.refetch()
        },
        vaultSecret,
        userCommitment,
        depositAccount,
        restoring: stored === undefined,
        error,
        setVaultSecret,
        clearVaultSecret,
      }}
    >
      {children}
    </CallerContext.Provider>
  )
}

export function useCaller(): CallerContextValue {
  const value = useContext(CallerContext)
  if (value === null) {
    throw new Error('useCaller must be used within CallerProvider')
  }
  return value
}
