'use client'

import { useState, type ReactNode } from 'react'

import { CallerLoginDialog } from '@/components/caller-login-dialog'
import { useCaller } from '@/components/contexts/CallerContext'
import { Button } from '@/components/ui/button'

/** The hex caller id shortened to its first six and last four characters. */
function abbreviateCaller(callerName: string): string {
  const callerId = callerName.slice(callerName.indexOf('/') + 1)
  return `${callerId.slice(0, 6)}…${callerId.slice(-4)}`
}

/** The caller's login state: the caller once logged in, otherwise the way in. */
export function CallerPanel(): ReactNode {
  const { callerName, loggingIn, error, login, logout } = useCaller()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Caller</p>
      {callerName === null ? (
        <>
          <p className="text-sm text-muted-foreground">
            {loggingIn ? 'Logging in…' : 'Not logged in.'}
          </p>
          <Button type="button" size="sm" disabled={loggingIn} onClick={() => setOpen(true)}>
            Log in
          </Button>
        </>
      ) : (
        <>
          <p className="font-mono text-sm" title={callerName}>
            {abbreviateCaller(callerName)}
          </p>
          <Button type="button" size="sm" variant="secondary" onClick={logout}>
            Log out
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
