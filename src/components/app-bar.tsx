import type { ReactNode } from 'react'

import { BrandLogo } from '@/components/brand-logo'
import { ModeToggle } from '@/components/mode-toggle'

export function AppBar(): ReactNode {
  return (
    <header className="border-b bg-secondary">
      <div className="flex h-14 items-center justify-between px-4">
        <BrandLogo />
        <ModeToggle />
      </div>
    </header>
  )
}
