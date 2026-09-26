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

interface SeedWalletDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: (seed: string) => void
}

/** Holds the seed only while the dialog is open and hands it over once on submit. */
export function SeedWalletDialog({
  open,
  onOpenChange,
  onConnect,
}: SeedWalletDialogProps): ReactNode {
  const id = useId()
  const [seed, setSeed] = useState('')
  const changeOpen = (value: boolean): void => {
    setSeed('')
    onOpenChange(value)
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Midnight seed wallet</DialogTitle>
          <DialogDescription>
            A hexadecimal seed of 16 to 64 bytes (optional 0x) creates a wallet that signs in this
            page. Keys stay in tab memory and a refresh requires re-entry.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const value = seed.trim()
            if (!value) return
            changeOpen(false)
            onConnect(value)
          }}
        >
          <Label htmlFor={id}>Seed</Label>
          <Input
            id={id}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={seed}
            onChange={(event) => {
              setSeed(event.target.value)
            }}
          />
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
          <Button type="submit" form={`${id}-form`} disabled={!seed.trim()}>
            Connect seed wallet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
