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
 * height.
 */
export function ActivityTable({ entries }: ActivityTableProps): ReactNode {
  return (
    <Table className="table-fixed border-separate border-spacing-0">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={`w-15 md:w-24.5 ${HEAD_CLASS}`}>Activity</TableHead>
          <TableHead className={`md:w-77 ${HEAD_CLASS}`}>Details</TableHead>
          <TableHead className={`hidden md:table-cell ${HEAD_CLASS}`}>Timestamp</TableHead>
          <TableHead className={`w-20 md:w-27.75 ${HEAD_CLASS}`}>Status</TableHead>
          <TableHead className={`w-7.5 md:hidden ${HEAD_CLASS}`}>
            <span className="sr-only">Expand</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      {entries.map((entry) => (
        <ActivityRow key={entry.name} entry={entry} />
      ))}
    </Table>
  )
}
