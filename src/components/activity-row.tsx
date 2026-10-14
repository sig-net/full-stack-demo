'use client'

import { ChevronDown, Eye } from 'lucide-react'
import { type ComponentProps, type ReactNode, useState } from 'react'

import { ActivityFlowDialog } from '@/components/activity-flow-dialog'
import { ActivityTransfer } from '@/components/activity-transfer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WalletSigningIcon } from '@/components/wallet-signing-icon'
import {
  ACTIVITY_KIND_LABELS,
  type ActivityEntry,
  type ActivityStatus,
} from '@/lib/activity/activity-entry'

const STATUS_BADGES: Record<
  ActivityStatus,
  { label: string; variant: ComponentProps<typeof Badge>['variant'] }
> = {
  pending: { label: 'Pending', variant: 'warning' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
}

/** Four columns show below `md`: the expanded row's single cell spans them. */
const MOBILE_COLUMN_COUNT = 4

/**
 * Rows are 72px including their 1px rule, with the content centred on the full 72px as the design
 * draws the rule inside the row: the 1px top padding balances the rule. From `md` up the cells draw
 * the rule, below `md` the details row under them does, so it sits below the expanded details.
 */
const CELL_CLASS = 'h-17.75 border-table-rule/50 p-0 pt-px md:h-18 md:border-b'

/** The detail labels match the table header text. */
const DETAIL_LABEL_CLASS = 'text-xs/4.5 font-bold text-secondary-foreground'

interface ActivityRowProps {
  entry: ActivityEntry
}

/**
 * One activity as its own `tbody`, the collapsible's root. Below `md` the Timestamp cell is
 * hidden and the chevron expands a second row holding it.
 */
export function ActivityRow({ entry }: ActivityRowProps): ReactNode {
  const { kind, from, to, timestampLabel, status } = entry
  const kindLabel = ACTIVITY_KIND_LABELS[kind]
  const badge = STATUS_BADGES[status]
  const [flowOpen, setFlowOpen] = useState(false)
  const walletTurn = entry.action.kind === 'balance'
  const flowLabel = walletTurn ? 'Action required' : 'View details'
  return (
    <Collapsible render={<TableBody />}>
      <TableRow className="hover:bg-transparent has-aria-expanded:bg-transparent">
        <TableCell className={`${CELL_CLASS} text-sm/5 font-medium text-tertiary-foreground`}>
          {kindLabel}
        </TableCell>
        <TableCell className={`${CELL_CLASS} max-md:whitespace-normal`}>
          <ActivityTransfer from={from} to={to} />
        </TableCell>
        <TableCell
          className={`hidden ${CELL_CLASS} text-sm/5 font-medium text-secondary-foreground md:table-cell`}
        >
          {timestampLabel}
        </TableCell>
        <TableCell className={CELL_CLASS}>
          {/* The badge and the flow dialog's button stack below `md`, where the Status column is too narrow for both in a row. */}
          <div className="flex flex-col items-start gap-1 md:flex-row md:items-center">
            <Badge variant={badge.variant} className="flex">
              {badge.label}
            </Badge>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={walletTurn ? 'text-foreground' : 'text-subtle-foreground'}
                      aria-label={`${flowLabel}: ${kindLabel} ${from.amount} ${from.assetSymbol}`}
                      onClick={() => {
                        setFlowOpen(true)
                      }}
                    />
                  }
                >
                  {walletTurn ? <WalletSigningIcon /> : <Eye className="size-5" aria-hidden />}
                </TooltipTrigger>
                <TooltipContent>{flowLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </TableCell>
        <TableCell className={`${CELL_CLASS} md:hidden`}>
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="mx-auto flex text-subtle-foreground"
              />
            }
            aria-label={`Details of ${kindLabel} ${from.amount} ${from.assetSymbol}`}
          >
            <ChevronDown
              className="size-5 transition-transform group-aria-expanded/button:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
        </TableCell>
      </TableRow>
      <TableRow className="hover:bg-transparent md:hidden">
        <TableCell
          colSpan={MOBILE_COLUMN_COUNT}
          className="border-b border-table-rule/50 p-0 whitespace-normal"
        >
          <CollapsibleContent>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 pb-4">
              <dt className={DETAIL_LABEL_CLASS}>Timestamp</dt>
              <dd className="text-sm/5 font-medium text-secondary-foreground">{timestampLabel}</dd>
            </dl>
          </CollapsibleContent>
        </TableCell>
      </TableRow>
      {flowOpen && <ActivityFlowDialog entry={entry} onOpenChange={setFlowOpen} />}
    </Collapsible>
  )
}
