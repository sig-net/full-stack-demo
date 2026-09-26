import { connection } from 'next/server'
import { Suspense, type ReactNode } from 'react'

import { AppBar } from '@/components/app-bar'
import { ConfigProvider } from '@/components/contexts/ConfigContext'
import { MidnightWalletProvider } from '@/components/contexts/MidnightWalletContext'
import { SplashScreen } from '@/components/splash-screen'
import { getClientConfig } from '@/lib/config/server-config'

export default async function ConfiguredLayout({ children }: LayoutProps<'/'>): Promise<ReactNode> {
  // Waits for a real request so the environment is read at runtime, never at build time.
  await connection()
  const config = getClientConfig()
  // React reports a rejection through the error boundary, so Node must not count it as unhandled.
  void config.catch(() => undefined)
  return (
    <Suspense fallback={<SplashScreen />}>
      <ConfigProvider config={config}>
        <MidnightWalletProvider>
          {/* Below md the app bar stays at the top while the page scrolls under it. */}
          <div className="sticky top-0 z-10 md:static">
            <AppBar />
          </div>
          {children}
        </MidnightWalletProvider>
      </ConfigProvider>
    </Suspense>
  )
}
