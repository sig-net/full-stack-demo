'use client'

import { Settings, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { ReadinessChecklist } from '@/components/readiness-checklist'
import { ReadinessRecheckButton } from '@/components/readiness-recheck-button'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { READINESS_CHECK_IDS } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'

/** The vault's health: every payer's readiness check, with a control to read them again. */
export function SettingsPopover(): ReactNode {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="h-auto flex-col gap-1.75 px-4 py-2 text-muted-foreground"
          />
        }
      >
        <Settings className="size-5" />
        Settings
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-sm">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <p className="font-medium">Vault health</p>
            <ReadinessRecheckButton />
          </div>
          <ReadinessChecklist checkIds={READINESS_CHECK_IDS} />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            nativeButton={false}
            render={<Link href="/admin" />}
          >
            <ShieldCheck aria-hidden />
            Admin
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
