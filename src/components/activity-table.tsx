import type { ReactNode } from 'react'

import { ActivityRow } from '@/components/activity-row'
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ActivityEntry } from '@/lib/activity/activity-entry'

const HEAD_CLASS =
  'h-11 border-b-2 border-table-rule p-0 text-xs/4.5 font-bold text-secondary-foreground'

interface ActivityTableProps {
  entries: readonly ActivityEntry[]
}

/**
 * Rules are cell borders in the separate border model, so each takes its full pixel inside the row
 * height. The Block Explorer copy buttons overhang the table's right edge by their -2px margin, so
 * the table's own `overflow-x-auto` container is made `overflow-visible`: it would otherwise add a
 * horizontal scrollbar for the overhang.
 */
export function ActivityTable({ entries }: ActivityTableProps): ReactNode {
  return (
    <div className="*:data-[slot=table-container]:overflow-visible">
      <Table className="table-fixed border-separate border-spacing-0">
        <TableHeader>
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
    </div>
  )
}
