'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

import { callerSecretSchema } from '@/lib/caller/caller'
import { getCallerName } from '@/server/actions/caller-actions'

export interface CallerContextValue {
  /** The secret every server action takes as its first argument. Null while logged out. */
  readonly callerSecret: string | null
  /** `callers/{caller}` once logged in. */
  readonly callerName: string | null
  readonly loggingIn: boolean
  readonly error: string | null
  readonly login: (secret: string) => Promise<void>
  readonly logout: () => void
}

const CallerContext = createContext<CallerContextValue | null>(null)

/** Holds the caller secret in page memory only: a reload logs out. */
export function CallerProvider({ children }: { children: ReactNode }): ReactNode {
  const [callerSecret, setCallerSecret] = useState<string | null>(null)
  const [callerName, setCallerName] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const logout = (): void => {
    setCallerSecret(null)
    setCallerName(null)
    setLoggingIn(false)
    setError(null)
  }

  const login = async (value: string): Promise<void> => {
    const parsed = callerSecretSchema.safeParse(value)
    if (!parsed.success) {
      setError('The caller secret must be 32 bytes in hex.')
      return
    }
    setLoggingIn(true)
    setError(null)
    try {
      const name = await getCallerName(parsed.data)
      setCallerSecret(parsed.data)
      setCallerName(name)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Login failed.')
    } finally {
      setLoggingIn(false)
    }
  }

  return (
    <CallerContext.Provider value={{ callerSecret, callerName, loggingIn, error, login, logout }}>
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
