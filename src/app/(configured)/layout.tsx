import { connection } from 'next/server'
import { Suspense, type ReactNode } from 'react'

import { SplashScreen } from '@/components/splash-screen'
import { ConfigProvider } from '@/contexts/config-provider'
import { getClientConfig } from '@/lib/config/server-config'

export default async function ConfiguredLayout({ children }: LayoutProps<'/'>): Promise<ReactNode> {
  // Waits for a real request so the environment is read at runtime, never at build time.
  await connection()
  const config = getClientConfig()
  // React reports a rejection through the error boundary, so Node must not count it as unhandled.
  void config.catch(() => undefined)
  return (
    <Suspense fallback={<SplashScreen />}>
      <ConfigProvider config={config}>{children}</ConfigProvider>
    </Suspense>
  )
}
