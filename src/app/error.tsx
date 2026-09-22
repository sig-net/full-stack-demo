'use client'

import type { ReactNode } from 'react'

import { ErrorNotice } from '@/components/error-notice'

interface ErrorPageProps {
  error: Error & { digest?: string }
  retry: () => void
}

/**
 * Catches errors from the nested layouts and pages, including a configuration load that fails,
 * so it renders inside the root layout's chrome and outside ConfigProvider.
 */
export default function ErrorPage({ error, retry }: ErrorPageProps): ReactNode {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <ErrorNotice error={error} retry={retry} />
    </main>
  )
}
