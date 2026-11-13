'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

/** Owns one query cache for the lifetime of the provider mount. */
export function ReactQueryProvider({ children }: { children: ReactNode }): ReactNode {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
