import type { ReactNode } from 'react'

import { ActivityTable } from '@/components/activity-table'
import { DUMMY_ACTIVITY } from '@/lib/activity/dummy-activity'

export function ActivitySection(): ReactNode {
  return (
    <section
      aria-labelledby="activity-title"
      className="flex min-h-0 flex-1 flex-col gap-4 md:gap-8"
    >
      <h2
        id="activity-title"
        className="text-base/4.5 font-bold tracking-widest text-subtle-foreground uppercase"
      >
        Activity
      </h2>
      <ActivityTable entries={DUMMY_ACTIVITY} />
    </section>
  )
}
