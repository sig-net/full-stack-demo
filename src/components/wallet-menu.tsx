import { Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function WalletMenu(): ReactNode {
  return (
    <Popover>
      <PopoverTrigger render={<Button size="lg" />}>
        <Wallet />
        Connect Wallet
      </PopoverTrigger>
      <PopoverContent align="end">Wallet connect</PopoverContent>
    </Popover>
  )
}
