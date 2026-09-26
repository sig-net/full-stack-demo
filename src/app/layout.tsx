import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

import { soehneMono } from '@/app/fonts/soehne-mono'

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
    <html lang="en" className={`${soehneMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        {/* Elza Text is served by the sig.network Adobe Fonts kit. */}
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://use.typekit.net/epi6oaz.css" />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-dvh flex-col">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  )
}
