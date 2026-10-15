'use client'

import { useState, type ReactNode } from 'react'

import { CallerLoginDialog } from '@/components/caller-login-dialog'
import { useCaller } from '@/components/contexts/CallerContext'
import { CopyButton } from '@/components/copy-button'
import { EthereumAccountLink } from '@/components/ethereum-account-link'
import { Button } from '@/components/ui/button'
import { abbreviateHex } from '@/lib/abbreviate-hex'

/** The identity secret's state: the caller it names and a copy of the secret once set, otherwise the way in. */
export function CallerPanel(): ReactNode {
  const { callerSecret, callerName, depositAccount, restoring, loggingIn, error, login, logout } =
    useCaller()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Identity secret</p>
      {callerSecret === null || callerName === null || depositAccount === null ? (
        <>
          <p className="text-sm text-muted-foreground">
            {restoring ? 'Checking for a saved secret…' : loggingIn ? 'Setting…' : 'Not set.'}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={restoring || loggingIn}
            onClick={() => setOpen(true)}
          >
            Set secret
          </Button>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1">
            <CopyButton label="identity secret" value={callerSecret} />
            <span className="font-mono text-sm" title={callerName}>
              {abbreviateHex(callerName.slice(callerName.indexOf('/') + 1))}
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
          <Button type="button" size="sm" variant="secondary" onClick={logout}>
            Clear secret
          </Button>
        </>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <CallerLoginDialog
        open={open}
        onOpenChange={setOpen}
        onLogin={(secret) => {
          void login(secret)
        }}
      />
    </div>
  )
}
