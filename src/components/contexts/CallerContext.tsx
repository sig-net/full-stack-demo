'use client'

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import {
  userCommitmentOf,
  vaultSecretSchema,
} from '@/lib/midnight/ethereum-erc20-vault/vault-secret'
import { vaultSecretStorage } from '@/lib/midnight/ethereum-erc20-vault/vault-secret-storage'

export interface CallerContextValue {
  /** The connected wallet's unshielded address, which every server action takes first. Null without a wallet. */
  readonly callerAddress: string | null
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
 * Names the caller after the connected wallet and holds the vault secret for the page. The
 * secret lives in local storage until it is cleared, so a reload keeps the same vault account,
 * and a stored value the schema rejects counts as unset until a new one replaces it. The caller
 * is logged in exactly while a wallet is connected, since the wallet's unshielded address is
 * the caller.
 */
export function CallerProvider({ children }: { children: ReactNode }): ReactNode {
  const { midnightSignet, midnightEthereumErc20Vault } = useConfig()
  const { wallet } = useMidnightWallet()
  const [refusal, setRefusal] = useState<string | null>(null)
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
        callerAddress: wallet?.addresses.unshieldedAddress ?? null,
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
