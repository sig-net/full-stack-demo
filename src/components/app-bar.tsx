import type { ReactNode } from 'react'

import { BrandEmblem } from '@/components/brand-emblem'
import { BrandLogo } from '@/components/brand-logo'
import { MobileMenu } from '@/components/mobile-menu'
import { SettingsMenu } from '@/components/settings-menu'
import { TotalBalance } from '@/components/total-balance'
import { WalletMenu } from '@/components/wallet-menu'

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
        <SettingsMenu />
      </div>
      <div className="hidden w-64.25 items-center justify-center md:flex">
        <WalletMenu />
      </div>
      <div className="flex items-center px-5 md:hidden">
        <MobileMenu />
      </div>
    </header>
  )
}
