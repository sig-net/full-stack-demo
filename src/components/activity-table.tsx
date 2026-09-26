import type { ReactNode } from 'react'

import { ActivityRow } from '@/components/activity-row'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ActivityEntry } from '@/lib/activity/activity-entry'

const HEAD_CLASS =
  'h-11 border-b-2 border-table-rule p-0 text-xs/4.5 font-bold text-secondary-foreground'

interface ActivityTableProps {
  entries: readonly ActivityEntry[]
}

/**
 * From `md` up the rows scroll inside the height the slot leaves them while the sticky header stays
 * put. The sticky header needs the `ScrollArea` viewport as its scroll container, so the table's
 * own `overflow-x-auto` container is made `overflow-visible`: any overflowing container between
 * them would capture the sticky position. Rules are cell borders in the separate border model, so
 * they scroll and stick with their cells and each takes its full pixel inside the row height. While
 * the rows overflow, the right padding keeps the overlaid scrollbar off the Block Explorer copy
 * icons. The 1px bleed on each side keeps glyph overhang at the table edges inside the viewport's
 * clip. The header sits above the `z-10` token icon badges scrolling under it.
 */
export function ActivityTable({ entries }: ActivityTableProps): ReactNode {
  return (
    <ScrollArea className="-mx-px data-has-overflow-y:pr-3 md:min-h-0 md:flex-1 **:data-[slot=table-container]:overflow-visible **:data-[slot=table-container]:px-px">
      <Table className="table-fixed border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-20 bg-background">
          <TableRow className="hover:bg-transparent">
            <TableHead className={`w-15 md:w-24.5 ${HEAD_CLASS}`}>Activity</TableHead>
            <TableHead className={`md:w-77 ${HEAD_CLASS}`}>Details</TableHead>
            <TableHead className={`hidden md:table-cell ${HEAD_CLASS}`}>Timestamp</TableHead>
            <TableHead className={`w-20 md:w-27.75 ${HEAD_CLASS}`}>Status</TableHead>
            <TableHead className={`hidden md:table-cell md:w-42.5 ${HEAD_CLASS}`}>
              Block Explorer
            </TableHead>
            <TableHead className={`w-7.5 md:hidden ${HEAD_CLASS}`}>
              <span className="sr-only">Expand</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        {entries.map((entry) => (
          <ActivityRow key={entry.id} entry={entry} />
        ))}
      </Table>
    </ScrollArea>
  )
}
