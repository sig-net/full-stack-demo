import { abbreviateHex } from '@/lib/abbreviate-hex'
import type { ActivityEntry, ActivityStatus } from '@/lib/activity/activity-entry'
import type { AssetAmount } from '@/lib/asset-amount'
import { NO_ICON } from '@/lib/icon-source'
import type {
  Activity,
  ActivityState,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  activityActionOf,
  activityStepsOf,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress'
import { BUNDLED_NETWORK_ICONS } from '@/lib/tokens/bundled-icons'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import type { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

/**
 * The row of an activity: the ERC20 on Ethereum moving to the vault's token on Midnight, named
 * and scaled by the registry, or by its address in raw base units when the registry lacks it.
 */
export function activityEntryOf(activity: Activity, registry: TokenInfoRegistry): ActivityEntry {
  const info = registry.byErc20Address(activity.erc20Address)
  const from: AssetAmount = {
    assetSymbol: info?.symbol ?? abbreviateHex(activity.erc20Address),
    networkName: 'Ethereum',
    amount:
      info === undefined
        ? activity.amount.toString()
        : formatTokenAmount(activity.amount, info.decimals),
    usdValue: '0.00',
    icon: info?.icon ?? NO_ICON,
    networkIcon: BUNDLED_NETWORK_ICONS.ethereum,
  }
  return {
    name: activity.name,
    kind: 'deposit',
    from,
    to: { kind: 'asset', asset: { ...from, networkName: 'Midnight', networkIcon: NO_ICON } },
    timestampLabel: formatTimestamp(activity.createTime),
    status: ACTIVITY_STATUS_BY_STATE[activity.state],
    action: activityActionOf(activity),
    steps: activityStepsOf(activity),
    error: activity.error,
  }
}

const ACTIVITY_STATUS_BY_STATE: Record<ActivityState, ActivityStatus> = {
  Pending: 'pending',
  Complete: 'complete',
  Failed: 'failed',
}

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

/** `July 8, 2025 07:18 PM`, assembled from parts so no locale joiner creeps in. */
export function formatTimestamp(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    TIMESTAMP_FORMAT.formatToParts(date).find((candidate) => candidate.type === type)?.value ?? ''
  return `${part('month')} ${part('day')}, ${part('year')} ${part('hour')}:${part('minute')} ${part('dayPeriod')}`
}
