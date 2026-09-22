'use client'

import { createContext, use, useContext, type ReactNode } from 'react'

import type { ClientConfig } from '@/lib/config/client-config'

const ConfigContext = createContext<ClientConfig | null>(null)

interface ConfigProviderProps {
  config: Promise<ClientConfig>
  children: ReactNode
}

/**
 * Suspends until the configuration promise settles, so the nearest Suspense boundary shows its
 * fallback and a rejection reaches the nearest error boundary.
 */
export function ConfigProvider({ config, children }: ConfigProviderProps): ReactNode {
  const value = use(config)
  return <ConfigContext value={value}>{children}</ConfigContext>
}

export function useConfig(): ClientConfig {
  const config = useContext(ConfigContext)
  if (config === null) {
    throw new Error('useConfig must be used inside ConfigProvider')
  }
  return config
}
