import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { BrandEmblem } from '@/components/brand-emblem'

export function SplashScreen(): ReactNode {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
      <BrandEmblem className="h-24 w-20" />
      <p role="status" className="flex items-center gap-2 text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading
      </p>
    </main>
  )
}
