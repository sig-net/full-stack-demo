import { Menu, Settings, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export function MobileMenu(): ReactNode {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Open menu" />}>
        <Menu className="size-8" />
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-2">
          <Button variant="ghost" size="lg" className="justify-start">
            <Wallet />
            Wallet
          </Button>
          <Button variant="ghost" size="lg" className="justify-start">
            <Settings />
            Settings
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
