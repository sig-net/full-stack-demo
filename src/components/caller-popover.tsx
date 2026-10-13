'use client'

import { EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'

import { CallerPanel } from '@/components/caller-panel'
import { useCaller } from '@/components/contexts/CallerContext'
import { StatusDot } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** The identity secret entry point in the app bar: the crossed-out eye, dotted once a secret is set. */
export function CallerPopover(): ReactNode {
  const { callerName, loggingIn } = useCaller()
  const status = callerName === null ? (loggingIn ? 'logging in' : 'not set') : 'set'
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            className="relative"
            aria-label={`Identity secret: ${status}`}
          />
        }
      >
        <EyeOff className="size-6" />
        {callerName !== null && (
          <span className="absolute right-2 bottom-2 flex">
            <StatusDot tone="success" />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end">
        <CallerPanel />
      </PopoverContent>
    </Popover>
  )
}
