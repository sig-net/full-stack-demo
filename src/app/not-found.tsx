import type { ReactNode } from 'react'

export default function NotFound(): ReactNode {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <p className="text-muted-foreground">Page not found.</p>
    </main>
  )
}
