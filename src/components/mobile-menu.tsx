import { Menu, Settings, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { WalletPanel } from '@/components/wallet-panel'

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
          <Collapsible>
            <CollapsibleTrigger
              render={<Button variant="ghost" size="lg" className="w-full justify-start" />}
            >
              <Wallet />
              Wallet
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pt-2 pb-3">
                <WalletPanel />
              </div>
              <Separator />
            </CollapsibleContent>
          </Collapsible>
          <Button variant="ghost" size="lg" className="justify-start">
            <Settings />
            Settings
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
