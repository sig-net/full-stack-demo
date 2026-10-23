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
import type { ClientConfig } from '@/lib/config/client-config'
import type {
  Activity,
  ActivityType,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { NO_PRICES } from '@/lib/pricing/spot-price-table'
import { completeApproval, prepareCompleteApproval } from '@/server/actions/approval-actions'
import { listActivities } from '@/server/actions/activity-actions'
import { completeDeposit, prepareCompleteDeposit } from '@/server/actions/deposit-actions'
import { completeRedeem, prepareCompleteRedeem } from '@/server/actions/redeem-actions'
import { completeSupply, prepareCompleteSupply } from '@/server/actions/supply-actions'
import { completeSwap, prepareCompleteSwap } from '@/server/actions/swap-actions'
import { completeWithdraw, prepareCompleteWithdraw } from '@/server/actions/withdraw-actions'

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
  const { callerAddress } = useCaller()
  const registry = useTokenInfoRegistry()
  const prices = useSpotPrices()
  const activities = useQuery({
    queryKey: [ACTIVITIES_QUERY_KEY, callerAddress, ...types],
    queryFn:
      callerAddress === null
        ? skipToken
        : async () => {
            const result = await listActivities(callerAddress, { types: [...types] })
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
      {callerAddress === null ? (
        <p role="status" className="text-muted-foreground">
          Connect a Midnight wallet to see your activity.
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

/** What a completion the page builds, proves and signs takes, beside the activity's name. */
interface PageCompletionArgs {
  readonly config: ClientConfig
  readonly wallet: Wallet
  readonly callerAddress: string
  readonly vaultSecret: string
  readonly name: string
}

/**
 * The completion of each type the page runs, loading its module on first use so a visitor who
 * never completes one downloads neither the call builder nor the contract.
 */
const PAGE_COMPLETE_BY_TYPE: Record<ActivityType, (args: PageCompletionArgs) => Promise<void>> = {
  Deposit: async ({ config, wallet, callerAddress, vaultSecret, name }) => {
    const calls =
      await import('@/lib/midnight/ethereum-erc20-vault/deposit-v1/browser-deposit-calls')
    await calls.completeDepositInBrowser({
      actions: { prepareCompleteDeposit, completeDeposit },
      builder: calls.browserDepositCallBuilder(config, window.location.origin),
      wallet,
      callerAddress,
      vaultSecret,
      name,
    })
  },
  Withdraw: async ({ config, wallet, callerAddress, vaultSecret, name }) => {
    const calls =
      await import('@/lib/midnight/ethereum-erc20-vault/withdraw-v1/browser-withdraw-calls')
    await calls.completeWithdrawInBrowser({
      actions: { prepareCompleteWithdraw, completeWithdraw },
      builder: calls.browserWithdrawCallBuilder(config, window.location.origin),
      wallet,
      callerAddress,
      vaultSecret,
      name,
    })
  },
  Supply: async ({ config, wallet, callerAddress, vaultSecret, name }) => {
    const calls = await import('@/lib/midnight/ethereum-erc20-vault/supply-v1/browser-supply-calls')
    await calls.completeSupplyInBrowser({
      actions: { prepareCompleteSupply, completeSupply },
      builder: calls.browserSupplyCallBuilder(config, window.location.origin),
      wallet,
      callerAddress,
      vaultSecret,
      name,
    })
  },
  Redeem: async ({ config, wallet, callerAddress, vaultSecret, name }) => {
    const calls = await import('@/lib/midnight/ethereum-erc20-vault/redeem-v1/browser-redeem-calls')
    await calls.completeRedeemInBrowser({
      actions: { prepareCompleteRedeem, completeRedeem },
      builder: calls.browserRedeemCallBuilder(config, window.location.origin),
      wallet,
      callerAddress,
      vaultSecret,
      name,
    })
  },
  Swap: async ({ config, wallet, callerAddress, vaultSecret, name }) => {
    const calls = await import('@/lib/midnight/ethereum-erc20-vault/swap-v1/browser-swap-calls')
    await calls.completeSwapInBrowser({
      actions: { prepareCompleteSwap, completeSwap },
      builder: calls.browserSwapCallBuilder(config, window.location.origin),
      wallet,
      callerAddress,
      vaultSecret,
      name,
    })
  },
  Approval: async ({ config, wallet, callerAddress, vaultSecret, name }) => {
    const calls =
      await import('@/lib/midnight/ethereum-erc20-vault/approval-v1/browser-approval-calls')
    await calls.completeApprovalInBrowser({
      actions: { prepareCompleteApproval, completeApproval },
      builder: calls.browserApprovalCallBuilder(config, window.location.origin),
      wallet,
      callerAddress,
      vaultSecret,
      name,
    })
  },
}

/**
 * Starts the completion of every activity that awaits it, once per row per retry window. The
 * page builds, proves and finalises the completion call with the connected wallet, so nothing runs
 * without one, and a refusal (the row already completing elsewhere) is reported and left to the
 * next window.
 */
function useAutoCompletion(activities: readonly Activity[] | undefined): void {
  const { callerAddress, vaultSecret } = useCaller()
  const { wallet } = useMidnightWallet()
  const config = useConfig()
  const registry = useTokenInfoRegistry()
  const queryClient = useQueryClient()
  const attemptedAt = useRef(new Map<string, number>())
  const complete = useEffectEvent(async (activity: Activity) => {
    if (callerAddress === null || vaultSecret === null || wallet === null) return
    attemptedAt.current.set(activity.name, Date.now())
    const { description } = activityEntryOf(activity, registry, NO_PRICES)
    try {
      await PAGE_COMPLETE_BY_TYPE[activity.type]({
        config,
        wallet,
        callerAddress,
        vaultSecret,
        name: activity.name,
      })
      toast.success(
        `Completing your ${description}: its completion call is proved and signed, and the backend is submitting it.`,
      )
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
    if (activities === undefined || vaultSecret === null || wallet === null) return
    for (const activity of activitiesDueForCompletion(
      activities,
      attemptedAt.current,
      Date.now(),
      COMPLETION_RETRY_MS,
    )) {
      void complete(activity)
    }
  }, [activities, vaultSecret, wallet])
}
