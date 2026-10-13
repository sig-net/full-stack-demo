'use client'

import { hexToBytes } from '@sig-net/midnight'
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { callerSecretSchema } from '@/lib/caller/caller'
import { callerSecretStorage } from '@/lib/caller/secret-storage'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import { getCallerName } from '@/server/actions/caller-actions'

export interface CallerContextValue {
  /** The secret every server action takes as its first argument. Null while logged out. */
  readonly callerSecret: string | null
  /** `callers/{caller}` once logged in. */
  readonly callerName: string | null
  /** The EVM account the caller's deposits are swept from, derived here from the secret and the public configuration. Null while logged out. */
  readonly depositAccount: string | null
  /** True until the stored secret has been checked on first load and its login, if any, has started. */
  readonly restoring: boolean
  readonly loggingIn: boolean
  readonly error: string | null
  readonly login: (secret: string) => Promise<void>
  readonly logout: () => void
}

const CallerContext = createContext<CallerContextValue | null>(null)

/**
 * Holds the caller secret for the page and keeps the last one set in local storage, so a reload
 * logs the same caller in again until the secret is cleared. A login or logout advances the
 * attempt, so a superseded login's result is dropped.
 */
export function CallerProvider({ children }: { children: ReactNode }): ReactNode {
  const { midnightSignet, midnightEthereumErc20Vault } = useConfig()
  const [callerSecret, setCallerSecret] = useState<string | null>(null)
  const [callerName, setCallerName] = useState<string | null>(null)
  const [depositAccount, setDepositAccount] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Undefined only while server rendering and hydrating, before the store has been read.
  const stored = useSyncExternalStore(
    callerSecretStorage.subscribe,
    callerSecretStorage.read,
    () => undefined,
  )
  const restoring =
    stored === undefined || (stored !== null && callerName === null && !loggingIn && error === null)
  const attempt = useRef(0)
  const inFlight = useRef<{ secret: string; promise: Promise<void> } | null>(null)

  const logout = (): void => {
    attempt.current += 1
    inFlight.current = null
    callerSecretStorage.clear()
    setCallerSecret(null)
    setCallerName(null)
    setDepositAccount(null)
    setLoggingIn(false)
    setError(null)
  }

  const login = (value: string): Promise<void> => {
    const parsed = callerSecretSchema.safeParse(value)
    if (!parsed.success) {
      setError('The identity secret must be 32 bytes in hex.')
      return Promise.resolve()
    }
    const secret = parsed.data
    if (inFlight.current?.secret === secret) return inFlight.current.promise
    attempt.current += 1
    const current = attempt.current
    setLoggingIn(true)
    setError(null)
    const account = depositAccountOf(
      { secretKey: hexToBytes(secret) },
      midnightSignet,
      midnightEthereumErc20Vault,
    )
    const promise = getCallerName(secret)
      .then((name) => {
        if (current !== attempt.current) return
        callerSecretStorage.write(secret)
        setCallerSecret(secret)
        setCallerName(name)
        setDepositAccount(account)
      })
      .catch((cause: unknown) => {
        if (current !== attempt.current) return
        setError(cause instanceof Error ? cause.message : 'Login failed.')
      })
      .finally(() => {
        if (current !== attempt.current) return
        inFlight.current = null
        setLoggingIn(false)
      })
    inFlight.current = { secret, promise }
    return promise
  }

  const restoreStoredSecret = useEffectEvent(() => {
    const saved = callerSecretStorage.read()
    if (saved === null) return
    // The restore starts after the mount commit, so its state updates render as a new pass.
    queueMicrotask(() => {
      // A stored value the schema rejects can never log in, so it is discarded on load.
      if (!callerSecretSchema.safeParse(saved).success) {
        callerSecretStorage.clear()
        setError('The saved identity secret was not 32 bytes in hex and has been discarded.')
        return
      }
      void login(saved)
    })
  })

  useEffect(() => {
    restoreStoredSecret()
    return () => {
      attempt.current += 1
      inFlight.current = null
    }
  }, [])

  return (
    <CallerContext.Provider
      value={{
        callerSecret,
        callerName,
        depositAccount,
        restoring,
        loggingIn,
        error,
        login,
        logout,
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
