'use client'

import { useId, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generateCallerSecret } from '@/lib/caller/caller'

interface CallerLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogin: (secret: string) => void
}

/** Holds the secret only while the dialog is open and hands it over once on submit. */
export function CallerLoginDialog({
  open,
  onOpenChange,
  onLogin,
}: CallerLoginDialogProps): ReactNode {
  const id = useId()
  const [secret, setSecret] = useState('')
  const changeOpen = (value: boolean): void => {
    setSecret('')
    onOpenChange(value)
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log in</DialogTitle>
          <DialogDescription>
            A random 32-byte secret in hex identifies you to the vault. It stays in tab memory and a
            refresh requires re-entry, so keep a copy to return to the same caller.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const value = secret.trim()
            if (!value) return
            changeOpen(false)
            onLogin(value)
          }}
        >
          <Label htmlFor={id}>Caller secret</Label>
          <Input
            id={id}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => {
              setSecret(generateCallerSecret())
            }}
          >
            Generate a new secret
          </Button>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              changeOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!secret.trim()}>
            Log in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
