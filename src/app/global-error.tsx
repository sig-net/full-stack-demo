'use client'

import type { ReactNode } from 'react'

import { ErrorNotice } from '@/components/error-notice'

import './globals.css'

interface GlobalErrorPageProps {
  error: Error & { digest?: string }
  retry: () => void
}

/** Replaces the root layout when the root layout itself throws, so it owns its own document. */
export default function GlobalErrorPage({ error, retry }: GlobalErrorPageProps): ReactNode {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center px-4 py-8">
        <ErrorNotice error={error} retry={retry} />
      </body>
    </html>
  )
}
