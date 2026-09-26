import { ChevronDown } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { ActivityExplorer } from '@/components/activity-explorer'
import { ActivityTransfer } from '@/components/activity-transfer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import type { ActivityEntry, ActivityKind, ActivityStatus } from '@/lib/activity/activity-entry'

const KIND_LABELS: Record<ActivityKind, string> = {
  send: 'Send',
  swap: 'Swap',
  deposit: 'Deposit',
}

const STATUS_BADGES: Record<
  ActivityStatus,
  { label: string; variant: ComponentProps<typeof Badge>['variant'] }
> = {
  pending: { label: 'Pending', variant: 'warning' },
  complete: { label: 'Complete', variant: 'success' },
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
 * One activity as its own `tbody`, the collapsible's root. Below `md` the Timestamp and Block
 * Explorer cells are hidden and the chevron expands a second row holding them.
 */
export function ActivityRow({ entry }: ActivityRowProps): ReactNode {
  const { kind, from, to, timestampLabel, status, transactionHashLabel } = entry
  const kindLabel = KIND_LABELS[kind]
  const badge = STATUS_BADGES[status]
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
          <Badge variant={badge.variant} className="flex">
            {badge.label}
          </Badge>
        </TableCell>
        <TableCell className={`hidden ${CELL_CLASS} md:table-cell`}>
          <ActivityExplorer transactionHashLabel={transactionHashLabel} />
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
              <dt className={DETAIL_LABEL_CLASS}>Block Explorer</dt>
              <dd>
                <ActivityExplorer transactionHashLabel={transactionHashLabel} />
              </dd>
            </dl>
          </CollapsibleContent>
        </TableCell>
      </TableRow>
    </Collapsible>
  )
}
