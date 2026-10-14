'use client'

import { skipToken, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { ActivityTable } from '@/components/activity-table'
import { useCaller } from '@/components/contexts/CallerContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { activityEntryOf } from '@/lib/activity/activity-entries'
import { listActivities } from '@/server/actions/activity-actions'

/** A pending row changes on every sweep, so the list is read often while one exists and rarely otherwise. */
const PENDING_REFETCH_INTERVAL_MS = 5_000
const IDLE_REFETCH_INTERVAL_MS = 30_000

export const ACTIVITIES_QUERY_KEY = 'activities'

/** The caller's vault activity, read from the backend's activity view and kept fresh by polling. */
export function ActivitySection(): ReactNode {
  const { callerSecret, callerName } = useCaller()
  const registry = useTokenInfoRegistry()
  const activities = useQuery({
    queryKey: [ACTIVITIES_QUERY_KEY, callerName],
    queryFn:
      callerSecret === null
        ? skipToken
        : async () => {
            const result = await listActivities(callerSecret, {})
            if (!result.ok) throw new Error(result.error)
            return result.activities
          },
    refetchInterval: (query) =>
      query.state.data?.some((activity) => activity.state === 'Pending')
        ? PENDING_REFETCH_INTERVAL_MS
        : IDLE_REFETCH_INTERVAL_MS,
  })
  return (
    <section aria-labelledby="activity-title" className="flex flex-col gap-4 md:gap-8">
      <h2
        id="activity-title"
        className="text-base/4.5 font-bold tracking-widest text-subtle-foreground uppercase"
      >
        Activity
      </h2>
      {callerSecret === null ? (
        <p role="status" className="text-muted-foreground">
          Set the identity secret to see your activity.
        </p>
      ) : activities.isError ? (
        <p role="alert" className="text-destructive">
          {activities.error.message}
        </p>
      ) : activities.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading activity…
        </p>
      ) : activities.data.length === 0 ? (
        <p role="status" className="text-muted-foreground">
          No activity yet.
        </p>
      ) : (
        <ActivityTable
          entries={activities.data.map((activity) => activityEntryOf(activity, registry))}
        />
      )}
    </section>
  )
}
