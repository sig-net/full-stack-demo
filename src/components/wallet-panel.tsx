'use client'

import { KeyRound, Unplug } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { AddressIdentifier } from '@/components/address-identifier'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { SeedWalletDialog } from '@/components/seed-wallet-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useNativeBalances } from '@/components/use-native-balances'
import { walletConnectionStatus } from '@/lib/midnight/wallet/connection-status'
import { NIGHT_DECIMALS } from '@/lib/midnight/wallet/native-balances'
import { READINESS_ASSET_DECIMALS } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { formatTokenAmountTruncated } from '@/lib/tokens/format-token-amount'

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

/** Fraction digits the two balances show, the rest cut. */
const NATIVE_BALANCE_PLACES = 2

/** The wallet's NIGHT and DUST, one line each, under the addresses. */
function NativeBalanceRows(): ReactNode {
  const balances = useNativeBalances()
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
      <dt className="text-muted-foreground">NIGHT</dt>
      <dd className="font-mono text-sm">
        {balances.data === undefined
          ? '…'
          : formatTokenAmountTruncated(balances.data.night, NIGHT_DECIMALS, NATIVE_BALANCE_PLACES)}
      </dd>
      <dt className="text-muted-foreground">DUST</dt>
      <dd className="font-mono text-sm">
        {balances.data === undefined
          ? '…'
          : formatTokenAmountTruncated(
              balances.data.dust,
              READINESS_ASSET_DECIMALS.DUST,
              NATIVE_BALANCE_PLACES,
            )}
      </dd>
      {balances.isError && (
        <dd role="alert" className="col-span-2 text-destructive">
          {balances.error.message}
        </dd>
      )}
    </dl>
  )
}

/** Owns the seed dialog, so a host must keep the panel mounted while the dialog is open. */
export function WalletPanel(): ReactNode {
  const connection = useMidnightWallet()
  const [seedOpen, setSeedOpen] = useState(false)
  const { wallet, addresses, connecting, restoring, syncStatus, error } = connection
  const status = walletConnectionStatus(connection)
  const showAddresses = connecting || addresses !== null || wallet !== null
  return (
    <div className="flex flex-col gap-2.5">
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
      {wallet !== null && (
        <>
          <Separator />
          <NativeBalanceRows />
        </>
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
          <Button variant="destructive" className="justify-start" onClick={connection.disconnect}>
            <Unplug />
            Disconnect wallet
          </Button>
        )}
      </div>
      <SeedWalletDialog
        open={seedOpen}
        onOpenChange={setSeedOpen}
        onConnect={(seed) => {
          void connection.connectSeedWallet(seed).catch(() => undefined)
        }}
      />
    </div>
  )
}
