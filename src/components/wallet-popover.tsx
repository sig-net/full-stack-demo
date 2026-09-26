'use client'

import { LoaderCircle, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { StatusDot } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WalletPanel } from '@/components/wallet-panel'
import { walletConnectionStatus } from '@/lib/midnight/wallet/connection-status'

export function WalletPopover(): ReactNode {
  const connection = useMidnightWallet()
  const { wallet, connecting, restoring } = connection
  const status = walletConnectionStatus(connection)
  return (
    <Popover>
      <PopoverTrigger render={<Button size="lg" aria-label={`Midnight wallet: ${status}`} />}>
        {connecting || restoring ? <LoaderCircle className="animate-spin" /> : <Wallet />}
        {wallet ? wallet.name : 'Connect Wallet'}
        <StatusDot tone={wallet ? 'success' : 'neutral'} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <WalletPanel />
      </PopoverContent>
    </Popover>
  )
}
