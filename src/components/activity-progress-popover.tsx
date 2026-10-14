'use client'

import { Circle, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ActivityEntry } from '@/lib/activity/activity-entry'
import type { ActivityStepStatus } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress'

/** Every step of the activity's flow with where it stands, behind an info button on the row. */
export function ActivityProgressPopover({ entry }: { entry: ActivityEntry }): ReactNode {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-subtle-foreground"
            aria-label={`Progress of ${entry.kind} ${entry.from.amount} ${entry.from.assetSymbol}`}
          />
        }
      >
        <Info className="size-5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-sm">
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">Deposit progress</p>
          <ol className="flex flex-col gap-1.5">
            {entry.steps.map((step) => {
              const { Icon, tone, spin } = STEP_ITEMS[step.status]
              return (
                <li key={step.label} className={`flex items-center gap-2 ${tone}`}>
                  <Icon aria-hidden className={`size-4 shrink-0 ${spin ? 'animate-spin' : ''}`} />
                  <span>{step.label}</span>
                  <span className="sr-only">({step.status})</span>
                </li>
              )
            })}
          </ol>
          {entry.action.kind === 'balance' && (
            <p className="text-muted-foreground">
              Your turn: balance the proved call with your wallet from the row.
            </p>
          )}
          {entry.action.kind === 'complete' && (
            <p className="text-muted-foreground">
              Your turn: complete the deposit from the row to mint the vault token.
            </p>
          )}
          {entry.error !== null && (
            <p role="alert" className="text-destructive">
              {entry.error}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const STEP_ITEMS: Record<ActivityStepStatus, { Icon: typeof Circle; tone: string; spin: boolean }> =
  {
    done: { Icon: CircleCheck, tone: 'text-success', spin: false },
    current: { Icon: LoaderCircle, tone: '', spin: true },
    pending: { Icon: Circle, tone: 'text-muted-foreground', spin: false },
    failed: { Icon: TriangleAlert, tone: 'text-destructive', spin: false },
  }
