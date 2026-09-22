import { createContext, useContext } from 'react'

import type { ClientConfig } from '@/lib/config/client-config'

export const ConfigContext = createContext<ClientConfig | null>(null)

export function useConfig(): ClientConfig {
  const config = useContext(ConfigContext)
  if (config === null) {
    throw new Error('useConfig must be used inside ConfigProvider')
  }
  return config
}
