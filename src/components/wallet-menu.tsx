'use client'

import { KeyRound, LoaderCircle, Unplug, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { AddressIdentifier } from '@/components/address-identifier'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { SeedWalletDialog } from '@/components/seed-wallet-dialog'
import { StatusDot } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

function AddressRow({ label, value }: { label: string; value: string | undefined }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      {value === undefined ? (
        <span className="text-muted-foreground">Not available yet.</span>
      ) : (
        <AddressIdentifier label={`${label} address`} address={value} />
      )}
    </div>
  )
}

export function WalletMenu(): ReactNode {
  const connection = useMidnightWallet()
  const [seedOpen, setSeedOpen] = useState(false)
  const { wallet, addresses, connecting, restoring, syncStatus, error } = connection
  const status = restoring
    ? 'restoring'
    : connecting
      ? 'connecting'
      : wallet
        ? 'connected'
        : 'not connected'
  const showAddresses = connecting || addresses !== null || wallet !== null
  return (
    <>
      <Popover>
        <PopoverTrigger render={<Button size="lg" aria-label={`Midnight wallet: ${status}`} />}>
          {connecting || restoring ? <LoaderCircle className="animate-spin" /> : <Wallet />}
          {wallet ? wallet.name : 'Connect Wallet'}
          <StatusDot tone={wallet ? 'success' : 'neutral'} />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96">
          <p className="font-medium">
            Midnight wallet <span className="text-muted-foreground">({status})</span>
          </p>
          {restoring && <p role="status">Checking for a saved wallet…</p>}
          {connecting && <p role="status">Connecting… {syncStatus}</p>}
          {error !== null && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {showAddresses && (
            <div className="flex flex-col gap-2">
              <AddressRow label="Shielded" value={addresses?.shieldedAddress} />
              <AddressRow label="Unshielded" value={addresses?.unshieldedAddress} />
              <AddressRow label="DUST" value={addresses?.dustAddress} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            {wallet === null && !connecting && !restoring && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setSeedOpen(true)
                }}
              >
                <KeyRound />
                Use a seed wallet
              </Button>
            )}
            {(wallet !== null || connecting) && (
              <Button
                variant="destructive"
                className="justify-start"
                onClick={connection.disconnect}
              >
                <Unplug />
                Disconnect wallet
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <SeedWalletDialog
        open={seedOpen}
        onOpenChange={setSeedOpen}
        onConnect={(seed) => {
          void connection.connectSeedWallet(seed).catch(() => undefined)
        }}
      />
    </>
  )
}
