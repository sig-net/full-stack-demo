'use client'

import { use, type ReactNode } from 'react'

import { ConfigContext } from '@/contexts/config-context'
import type { ClientConfig } from '@/lib/config/client-config'

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
