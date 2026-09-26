import type { ReactNode } from 'react'

import { BrandEmblem } from '@/components/brand-emblem'
import { BrandLogo } from '@/components/brand-logo'
import { MobileMenu } from '@/components/mobile-menu'
import { SettingsPopover } from '@/components/settings-popover'
import { TotalBalance } from '@/components/total-balance'
import { WalletPopover } from '@/components/wallet-popover'

export function AppBar(): ReactNode {
  return (
    <header className="flex h-19.5 items-stretch border-b bg-background md:h-35">
      <div className="flex w-13 items-center justify-center border-r md:w-81">
        <BrandEmblem className="h-9.5 w-auto md:hidden" />
        <div className="hidden md:block">
          <BrandLogo />
        </div>
      </div>
      <div className="flex flex-1 items-center px-5 md:px-10">
        <TotalBalance />
      </div>
      <div className="hidden w-38.75 items-center justify-center border-r md:flex">
        <SettingsPopover />
      </div>
      <div className="hidden w-64.25 items-center justify-center md:flex">
        <WalletPopover />
      </div>
      <div className="flex items-center px-5 md:hidden">
        <MobileMenu />
      </div>
    </header>
  )
}
