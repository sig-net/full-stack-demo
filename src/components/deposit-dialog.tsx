'use client'

import { getAddress } from 'ethers'
import { CircleAlert, X } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'

import { CopyButton } from '@/components/copy-button'
import { QrCode } from '@/components/qr-code'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { abbreviateHex } from '@/lib/abbreviate-hex'

interface DepositDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The caller's deposit account on Ethereum, in any letter case. */
  address: string
}

/**
 * The deposit address as a QR code and a copyable checksummed address. The QR panel keeps the
 * design's light palette in both themes, since a code scans dark on light, and its tinted
 * background is the design's own gradient.
 */
export function DepositDialog({ open, onOpenChange, address }: DepositDialogProps): ReactNode {
  const checksummed = getAddress(address)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-5 p-6 sm:max-w-110 sm:p-10">
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle className="text-xl font-semibold text-secondary-foreground">
            Deposit address
          </DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
            <X />
          </DialogClose>
        </DialogHeader>
        <p className="text-base font-semibold text-muted-foreground">Ethereum address</p>
        <div className="flex flex-col items-center gap-5.5 rounded-xs border border-muted-foreground/80 bg-white bg-deposit-panel p-5">
          <div className="relative flex aspect-square w-full max-w-67.5 items-center justify-center rounded-xs bg-swiss-coffee-50 p-3.5">
            <QrCode
              value={checksummed}
              label={`QR code of ${checksummed}`}
              logoFraction={LOGO_FRACTION}
              className="size-full fill-black"
            />
            <div className="absolute flex size-12 items-center justify-center rounded-full bg-dark-neutral-950">
              <Image
                src="/icons/ethereum-glyph-mono.svg"
                alt=""
                width={32}
                height={32}
                unoptimized
              />
            </div>
          </div>
          <span className="flex items-center gap-4.75 rounded-xs bg-swiss-coffee-50 px-2 py-1">
            <span className="font-mono text-base text-dark-neutral-400" title={checksummed}>
              {abbreviateHex(checksummed)}
            </span>
            <CopyButton label="deposit address" value={checksummed} />
          </span>
        </div>
        <DialogDescription className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
          <CircleAlert className="size-6 shrink-0" aria-hidden />
          Use this address to deposit on Ethereum
        </DialogDescription>
      </DialogContent>
    </Dialog>
  )
}

/** The 48px logo over the 242px code, plus a margin, so the covered modules stay within level H's tolerance. */
const LOGO_FRACTION = 0.22
