'use client'

import { EyeOff, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { useCaller } from '@/components/contexts/CallerContext'
import { StatusDot } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { VaultSecretPanel } from '@/components/vault-secret-panel'

/** The vault secret entry point in the app bar: the crossed-out eye, dotted once a secret is set. */
export function VaultSecretPopover(): ReactNode {
  const { vaultSecret, restoring } = useCaller()
  const status = vaultSecret !== null ? 'set' : restoring ? 'restoring' : 'not set'
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            className="relative"
            aria-label={`Vault secret: ${status}`}
          />
        }
      >
        {restoring ? (
          <LoaderCircle className="size-6 animate-spin" />
        ) : (
          <EyeOff className="size-6" />
        )}
        {vaultSecret !== null && (
          <span className="absolute right-2 bottom-2 flex">
            <StatusDot tone="success" />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end">
        <VaultSecretPanel />
      </PopoverContent>
    </Popover>
  )
}
