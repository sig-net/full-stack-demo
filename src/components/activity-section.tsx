'use client'

import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useEffectEvent, useRef } from 'react'
import { toast } from 'sonner'

import { ActivityTable } from '@/components/activity-table'
import { useCaller } from '@/components/contexts/CallerContext'
import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useSpotPrices } from '@/components/use-spot-prices'
import { activityEntryOf } from '@/lib/activity/activity-entries'
import { activitiesDueForCompletion } from '@/lib/activity/completions-due'
import type {
  Activity,
  ActivityType,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'
import { NO_PRICES } from '@/lib/pricing/spot-price-table'
import { completeApproval } from '@/server/actions/approval-actions'
import { listActivities } from '@/server/actions/activity-actions'
import { completeDeposit, prepareCompleteDeposit } from '@/server/actions/deposit-actions'
import { completeRedeem } from '@/server/actions/redeem-actions'
import { completeSupply } from '@/server/actions/supply-actions'
import { completeSwap } from '@/server/actions/swap-actions'
import { completeWithdraw } from '@/server/actions/withdraw-actions'

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
  const prices = useSpotPrices()
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
          entries={activities.data.map((activity) =>
            activityEntryOf(activity, registry, prices.table),
          )}
        />
      )}
    </section>
  )
}

/** The completion action of each type whose call the server builds, all of one shape on the wire. */
const SERVER_BUILT_COMPLETE_BY_TYPE: Record<
  Exclude<ActivityType, 'Deposit'>,
  (
    callerSecret: string,
    args: { name: string; wallet: WalletPublicKeys },
  ) => Promise<{ ok: true } | { ok: false; error: string }>
> = {
  Withdraw: completeWithdraw,
  Swap: completeSwap,
  Supply: completeSupply,
  Redeem: completeRedeem,
  Approval: completeApproval,
}

/**
 * Starts the completion of every activity that awaits it, once per row per retry window. The
 * page builds, proves and binds a deposit's completion call, and the server builds every other
 * type's for the connected wallet's keys, so nothing runs without a wallet, and a refusal (the
 * row already completing elsewhere) is reported and left to the next window.
 */
function useAutoCompletion(activities: readonly Activity[] | undefined): void {
  const { callerSecret } = useCaller()
  const { wallet } = useMidnightWallet()
  const config = useConfig()
  const registry = useTokenInfoRegistry()
  const queryClient = useQueryClient()
  const attemptedAt = useRef(new Map<string, number>())
  const complete = useEffectEvent(async (activity: Activity) => {
    if (callerSecret === null || wallet === null) return
    attemptedAt.current.set(activity.name, Date.now())
    const { description } = activityEntryOf(activity, registry, NO_PRICES)
    try {
      if (activity.type === 'Deposit') {
        // Loaded on first use, so a visitor who never deposits never downloads the call builder and the contract.
        const calls =
          await import('@/lib/midnight/ethereum-erc20-vault/deposit-v1/browser-deposit-calls')
        await calls.completeDepositInBrowser({
          actions: { prepareCompleteDeposit, completeDeposit },
          builder: calls.browserDepositCallBuilder(config, window.location.origin),
          wallet,
          callerSecret,
          name: activity.name,
        })
        toast.success(
          `Completing your ${description}: its completion call is proved and signed, and the backend is submitting it.`,
        )
      } else {
        const result = await SERVER_BUILT_COMPLETE_BY_TYPE[activity.type](callerSecret, {
          name: activity.name,
          wallet: wallet.publicKeys,
        })
        if (!result.ok) throw new Error(result.error)
        toast.success(
          `Completing your ${description}: sign its completion call from the Activity row once it is proved.`,
        )
      }
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
    } catch (error: unknown) {
      toast.error(
        `Completing your ${description} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
  // A wallet restores after the first read of the activities, whose data then keeps its identity
  // until a row changes, so the wallet and the secret arriving must run the pass too.
  useEffect(() => {
    if (activities === undefined || callerSecret === null || wallet === null) return
    for (const activity of activitiesDueForCompletion(
      activities,
      attemptedAt.current,
      Date.now(),
      COMPLETION_RETRY_MS,
    )) {
      void complete(activity)
    }
  }, [activities, callerSecret, wallet])
}
