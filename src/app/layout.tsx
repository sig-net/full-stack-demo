import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

import { AppBar } from '@/components/app-bar'
import { AppFooter } from '@/components/app-footer'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Full stack demo',
    template: '%s | Full stack demo',
  },
  description: 'A sig.network full stack demonstration application.',
}

export default function RootLayout({ children }: LayoutProps<'/'>): ReactNode {
  return (
    // next-themes sets the theme class on <html> before hydration, so the server markup differs.
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-dvh flex-col">
            <AppBar />
            {children}
            <AppFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
