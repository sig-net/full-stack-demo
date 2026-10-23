'use client'

import { useState, type ReactNode } from 'react'

import { useCaller } from '@/components/contexts/CallerContext'
import { CopyButton } from '@/components/copy-button'
import { EthereumAccountLink } from '@/components/ethereum-account-link'
import { Button } from '@/components/ui/button'
import { VaultSecretDialog } from '@/components/vault-secret-dialog'
import { abbreviateHex } from '@/lib/abbreviate-hex'

/** The vault secret's state: its commitment and deposit account with a copy of the secret once set, otherwise the way in. */
export function VaultSecretPanel(): ReactNode {
  const {
    vaultSecret,
    userCommitment,
    depositAccount,
    restoring,
    error,
    setVaultSecret,
    clearVaultSecret,
  } = useCaller()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Vault secret</p>
      {vaultSecret === null || userCommitment === null || depositAccount === null ? (
        <>
          <p className="text-sm text-muted-foreground">
            {restoring ? 'Checking for a saved secret…' : 'Not set.'}
          </p>
          <Button type="button" size="sm" disabled={restoring} onClick={() => setOpen(true)}>
            Set secret
          </Button>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1">
            <CopyButton label="vault secret" value={vaultSecret} />
            <span className="font-mono text-sm" title={userCommitment}>
              {abbreviateHex(userCommitment)}
            </span>
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">Deposit account</span>
            <span className="flex items-center gap-1">
              <CopyButton label="deposit account" value={depositAccount} />
              <EthereumAccountLink account={depositAccount} label="deposit account" />
              <span className="font-mono text-sm" title={depositAccount}>
                {abbreviateHex(depositAccount)}
              </span>
            </span>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={clearVaultSecret}>
            Clear secret
          </Button>
        </>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <VaultSecretDialog open={open} onOpenChange={setOpen} onSet={setVaultSecret} />
    </div>
  )
}
