'use client'

import '@/lib/midnight/buffer-shim'

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
import {
  clearStoredSeed,
  readStoredSeed,
  storeSeed,
  subscribeToStoredSeed,
} from '@/lib/midnight/wallet/seed-storage'
import type { Wallet, WalletAddressSnapshot } from '@/lib/midnight/wallet/wallet'

export interface MidnightWalletContextValue {
  readonly wallet: Wallet | null
  readonly addresses: WalletAddressSnapshot | null
  readonly connecting: boolean
  /** True until the stored seed has been checked on first load; no connection may start before. */
  readonly restoring: boolean
  readonly syncStatus: string
  readonly error: string | null
  readonly connectSeedWallet: (seed: string) => Promise<Wallet>
  readonly disconnect: () => void
}

const MidnightWalletContext = createContext<MidnightWalletContextValue | null>(null)

const SEED_PATTERN = /^(?:[0-9a-f]{2}){16,64}$/

/**
 * Owns one wallet generation at a time. A new connection or a disconnect advances the generation,
 * so results from a superseded connection are dropped instead of published, and the wallet's
 * resources are released exactly once. The connected seed is kept in local storage and restored
 * on load, so a stored seed blocks any other connection until the wallet disconnects.
 */
export function MidnightWalletProvider({ children }: { children: ReactNode }): ReactNode {
  const { midnightNetwork } = useConfig()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [addresses, setAddresses] = useState<WalletAddressSnapshot | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Undefined only while server rendering and hydrating, before the store has been read.
  const storedSeed = useSyncExternalStore(subscribeToStoredSeed, readStoredSeed, () => undefined)
  const restoring =
    storedSeed === undefined ||
    (storedSeed !== null && wallet === null && !connecting && error === null)
  const generation = useRef(0)
  const active = useRef<Wallet | null>(null)
  const installedSeed = useRef<string | null>(null)
  const inFlight = useRef<{ seed: string; promise: Promise<Wallet> } | null>(null)

  const disconnect = (): void => {
    generation.current += 1
    clearStoredSeed()
    installedSeed.current = null
    inFlight.current = null
    void active.current?.disconnect().catch(() => undefined)
    active.current = null
    setWallet(null)
    setAddresses(null)
    setConnecting(false)
    setSyncStatus('')
    setError(null)
  }

  /**
   * One wallet is connected at a time, whatever its kind. Every connect function asks here first
   * and refuses while a wallet is active, connecting or stored for restore.
   *
   * @param seed - The seed being connected, so a restore of the stored seed itself may proceed.
   * @returns The refusal, or null when the connection may go ahead.
   */
  const heldConnection = (seed?: string): Error | null => {
    const stored = readStoredSeed()
    const held =
      active.current !== null || inFlight.current !== null || (stored !== null && stored !== seed)
    return held ? new Error('Disconnect the current wallet before connecting another.') : null
  }

  const connectSeedWallet = (input: string): Promise<Wallet> => {
    const seed = input.trim().replace(/^0x/i, '').toLowerCase()
    if (!SEED_PATTERN.test(seed)) {
      const failure = new Error('Enter a hexadecimal Midnight seed of 16 to 64 bytes.')
      setError(failure.message)
      return Promise.reject(failure)
    }
    if (inFlight.current?.seed === seed) return inFlight.current.promise
    if (active.current && installedSeed.current === seed) return Promise.resolve(active.current)
    const held = heldConnection(seed)
    if (held !== null) {
      setError(held.message)
      return Promise.reject(held)
    }
    setError(null)
    const attempt = generation.current
    installedSeed.current = seed
    storeSeed(seed)
    setConnecting(true)
    setSyncStatus('starting wallet…')
    const promise = (async () => {
      // The wallet SDK loads on first connection, so visitors who never connect never download it.
      const { SeedWallet } = await import('@/lib/midnight/wallet/seed-wallet')
      if (attempt !== generation.current) throw new Error('Wallet connection superseded.')
      const candidate = new SeedWallet(midnightNetwork, seed)
      active.current = candidate
      await candidate.initialise(
        (status) => {
          if (attempt === generation.current) setSyncStatus(status)
        },
        (snapshot) => {
          if (attempt === generation.current && active.current === candidate) setAddresses(snapshot)
        },
      )
      if (attempt !== generation.current) throw new Error('Wallet connection superseded.')
      setWallet(candidate)
      return candidate
    })()
      .catch((failure: unknown) => {
        if (attempt === generation.current) {
          void active.current?.disconnect().catch(() => undefined)
          active.current = null
          installedSeed.current = null
          clearStoredSeed()
          setWallet(null)
          setAddresses(null)
          setSyncStatus('')
          setError(failure instanceof Error ? failure.message : 'Seed wallet connection failed.')
        }
        throw failure
      })
      .finally(() => {
        if (attempt === generation.current) {
          inFlight.current = null
          setConnecting(false)
        }
      })
    inFlight.current = { seed, promise }
    return promise
  }

  const restoreStoredSeed = useEffectEvent(() => {
    const stored = readStoredSeed()
    if (stored === null) return
    // The restore starts after the mount commit, so its state updates render as a new pass.
    queueMicrotask(() => {
      void connectSeedWallet(stored).catch(() => undefined)
    })
  })

  useEffect(() => {
    restoreStoredSeed()
    return () => {
      generation.current += 1
      installedSeed.current = null
      inFlight.current = null
      void active.current?.disconnect().catch(() => undefined)
      active.current = null
    }
  }, [])

  return (
    <MidnightWalletContext
      value={{
        wallet,
        addresses,
        connecting,
        restoring,
        syncStatus,
        error,
        connectSeedWallet,
        disconnect,
      }}
    >
      {children}
    </MidnightWalletContext>
  )
}

export function useMidnightWallet(): MidnightWalletContextValue {
  const context = useContext(MidnightWalletContext)
  if (context === null) {
    throw new Error('useMidnightWallet must be used inside MidnightWalletProvider')
  }
  return context
}
