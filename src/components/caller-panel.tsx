'use client'

import { useState, type ReactNode } from 'react'

import { CallerLoginDialog } from '@/components/caller-login-dialog'
import { useCaller } from '@/components/contexts/CallerContext'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'

/** The hex caller id shortened to its first six and last four characters. */
function abbreviateCaller(callerName: string): string {
  const callerId = callerName.slice(callerName.indexOf('/') + 1)
  return `${callerId.slice(0, 6)}…${callerId.slice(-4)}`
}

/** The identity secret's state: the caller it names and a copy of the secret once set, otherwise the way in. */
export function CallerPanel(): ReactNode {
  const { callerSecret, callerName, loggingIn, error, login, logout } = useCaller()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Identity secret</p>
      {callerSecret === null || callerName === null ? (
        <>
          <p className="text-sm text-muted-foreground">{loggingIn ? 'Setting…' : 'Not set.'}</p>
          <Button type="button" size="sm" disabled={loggingIn} onClick={() => setOpen(true)}>
            Set secret
          </Button>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1">
            <CopyButton label="identity secret" value={callerSecret} />
            <span className="font-mono text-sm" title={callerName}>
              {abbreviateCaller(callerName)}
            </span>
          </span>
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
