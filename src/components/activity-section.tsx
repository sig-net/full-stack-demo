'use client'

import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useEffectEvent, useRef } from 'react'
import { toast } from 'sonner'

import { ActivityTable } from '@/components/activity-table'
import { useCaller } from '@/components/contexts/CallerContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { activityEntryOf } from '@/lib/activity/activity-entries'
import { activitiesDueForCompletion } from '@/lib/activity/completions-due'
import type {
  Activity,
  ActivityType,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'
import { completeApproval } from '@/server/actions/approval-actions'
import { listActivities } from '@/server/actions/activity-actions'
import { completeDeposit } from '@/server/actions/deposit-actions'
import { completeSwap } from '@/server/actions/swap-actions'

/** A pending row changes on every sweep, so the list is read often while one exists and rarely otherwise. */
const PENDING_REFETCH_INTERVAL_MS = 5_000
const IDLE_REFETCH_INTERVAL_MS = 30_000

/** A completion the server refused or that was lost is tried again after this long. */
const COMPLETION_RETRY_MS = 30_000

export const ACTIVITIES_QUERY_KEY = 'activities'

interface ActivitySectionProps {
  /** The activity types the section lists. */
  types: readonly [ActivityType, ...ActivityType[]]
  title?: string
}

/**
 * The caller's vault activity of the given types, read from the backend's activity view and
 * kept fresh by polling. An operation that awaits its completion is completed from here without
 * a click, since the browser is the one place that holds the secret the completion call is
 * built with.
 */
export function ActivitySection({ types, title = 'Activity' }: ActivitySectionProps): ReactNode {
  const { callerSecret, callerName } = useCaller()
  const registry = useTokenInfoRegistry()
  const activities = useQuery({
    queryKey: [ACTIVITIES_QUERY_KEY, callerName, ...types],
    queryFn:
      callerSecret === null
        ? skipToken
        : async () => {
            const result = await listActivities(callerSecret, { types: [...types] })
            if (!result.ok) throw new Error(result.error)
            return result.activities
          },
    refetchInterval: (query) =>
      query.state.data?.some((activity) => activity.state === 'Pending')
        ? PENDING_REFETCH_INTERVAL_MS
        : IDLE_REFETCH_INTERVAL_MS,
  })
  useAutoCompletion(activities.data)
  return (
    <section aria-labelledby="activity-title" className="flex flex-col gap-4 md:gap-8">
      <h2
        id="activity-title"
        className="text-base/4.5 font-bold tracking-widest text-subtle-foreground uppercase"
      >
        {title}
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

/** The completion action of each activity type, all of one shape on the wire. */
const COMPLETE_BY_TYPE: Record<
  ActivityType,
  (
    callerSecret: string,
    args: { name: string; wallet: WalletPublicKeys },
  ) => Promise<{ ok: true } | { ok: false; error: string }>
> = {
  Deposit: completeDeposit,
  Swap: completeSwap,
  Approval: completeApproval,
}

/**
 * Starts the completion of every activity that awaits it, once per row per retry window. The
 * server builds the call for the connected wallet's keys, so nothing runs without a wallet, and
 * a refusal (the row already completing elsewhere) is reported and left to the next window.
 */
function useAutoCompletion(activities: readonly Activity[] | undefined): void {
  const { callerSecret } = useCaller()
  const { wallet } = useMidnightWallet()
  const registry = useTokenInfoRegistry()
  const queryClient = useQueryClient()
  const attemptedAt = useRef(new Map<string, number>())
  const complete = useEffectEvent(async (activity: Activity) => {
    if (callerSecret === null || wallet === null) return
    attemptedAt.current.set(activity.name, Date.now())
    const { description } = activityEntryOf(activity, registry)
    try {
      const result = await COMPLETE_BY_TYPE[activity.type](callerSecret, {
        name: activity.name,
        wallet: wallet.publicKeys,
      })
      if (!result.ok) throw new Error(result.error)
      toast.success(
        `Completing your ${description}: sign its completion call from the Activity row once it is proved.`,
      )
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
    } catch (error: unknown) {
      toast.error(
        `Completing your ${description} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
  useEffect(() => {
    if (activities === undefined) return
    for (const activity of activitiesDueForCompletion(
      activities,
      attemptedAt.current,
      Date.now(),
      COMPLETION_RETRY_MS,
    )) {
      void complete(activity)
    }
  }, [activities])
}
