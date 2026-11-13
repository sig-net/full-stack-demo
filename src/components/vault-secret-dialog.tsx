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
import { generateVaultSecret } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'

interface VaultSecretDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSet: (secret: string) => void
}

/** Holds the secret only while the dialog is open and hands it over once on submit. */
export function VaultSecretDialog({
  open,
  onOpenChange,
  onSet,
}: VaultSecretDialogProps): ReactNode {
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
          <DialogTitle>Set the vault secret</DialogTitle>
          <DialogDescription>
            A random 32-byte vault secret in hex is the witness of your vault calls and picks your
            deposit account. This browser keeps it until you clear it, so keep a copy to return to
            the same deposit account elsewhere.
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
            onSet(value)
          }}
        >
          <Label htmlFor={id}>Vault secret</Label>
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
              setSecret(generateVaultSecret())
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
            Set secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
