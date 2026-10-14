import { abbreviateHex } from '@/lib/abbreviate-hex'
import { abbreviateAddressData } from '@/lib/midnight/abbreviate-address'
import type {
  ActivityDestination,
  ActivityEntry,
  ActivityKind,
  ActivityStatus,
} from '@/lib/activity/activity-entry'
import type { AssetAmount } from '@/lib/asset-amount'
import { NO_ICON } from '@/lib/icon-source'
import type {
  Activity,
  ActivityState,
  ActivityType,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  activityActionOf,
  activityStepsOf,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress'
import { BUNDLED_NETWORK_ICONS } from '@/lib/tokens/bundled-icons'
import { ORIGIN_NETWORKS, type OriginNetwork } from '@/lib/tokens/token-info'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import type { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

/**
 * The row of an activity, with each token named and scaled by the registry, or by its address
 * in raw base units when the registry lacks it. A deposit moves the ERC20 from Ethereum to the
 * shielded wallet it mints to, a send moves a vault token to an address on Ethereum, a swap trades one vault
 * token for another, a supply deposits a vault token into the Aave wrapper on Ethereum, a redeem
 * takes the underlying back out of it, and an approval grants a spender on Ethereum.
 */
export function activityEntryOf(activity: Activity, registry: TokenInfoRegistry): ActivityEntry {
  const { from, to, description } = sidesOf(activity, registry)
  return {
    name: activity.name,
    kind: ACTIVITY_KIND_BY_TYPE[activity.type],
    description,
    from,
    to,
    timestampLabel: formatTimestamp(activity.createTime),
    status: ACTIVITY_STATUS_BY_STATE[activity.state],
    action: activityActionOf(activity),
    steps: activityStepsOf(activity),
    error: activity.error,
  }
}

function sidesOf(
  activity: Activity,
  registry: TokenInfoRegistry,
): { from: AssetAmount; to: ActivityDestination; description: string } {
  switch (activity.type) {
    case 'Deposit': {
      const from = assetAmount(registry, activity.erc20Address, activity.amount)
      return {
        from,
        to: {
          kind: 'wallet',
          address: activity.destination,
          addressLabel:
            activity.destination === null
              ? YOUR_WALLET_LABEL
              : abbreviateAddressData(activity.destination),
        },
        description: `deposit of ${labelOf(from)}`,
      }
    }
    case 'Withdraw': {
      const from = assetAmount(registry, activity.erc20Address, activity.amount)
      const addressLabel = abbreviateHex(activity.destination)
      return {
        from,
        to: { kind: 'wallet', address: activity.destination, addressLabel },
        description: `send of ${labelOf(from)} to ${addressLabel}`,
      }
    }
    case 'Swap': {
      const from = assetAmount(registry, activity.erc20Address, activity.amount)
      const asset = assetAmount(registry, activity.erc20AddressOut, activity.amountOut)
      return {
        from,
        to: { kind: 'asset', asset },
        description: `swap of up to ${labelOf(from)} for ${labelOf(asset)}`,
      }
    }
    case 'Supply': {
      const from = assetAmount(registry, activity.erc20Address, activity.amount)
      const wrapper = registry.byErc20Address(activity.destination)
      const addressLabel =
        wrapper === undefined ? abbreviateHex(activity.destination) : wrapper.symbol
      return {
        from,
        to: { kind: 'wallet', address: activity.destination, addressLabel },
        description: `supply of ${labelOf(from)} to ${addressLabel}`,
      }
    }
    case 'Redeem': {
      const from = assetAmount(registry, activity.erc20Address, activity.amount)
      const underlying = registry.byErc20Address(activity.destination)
      const addressLabel =
        underlying === undefined ? abbreviateHex(activity.destination) : underlying.symbol
      return {
        from,
        to: { kind: 'wallet', address: activity.destination, addressLabel },
        description: `redeem of ${labelOf(from)} for ${addressLabel}`,
      }
    }
    case 'Approval': {
      const from = assetAmount(registry, activity.erc20Address, null)
      const addressLabel = abbreviateHex(activity.spender)
      return {
        from,
        to: { kind: 'wallet', address: activity.spender, addressLabel },
        description: `approval of ${from.assetSymbol} for ${addressLabel}`,
      }
    }
    default: {
      const unhandled: never = activity
      throw new Error(`Unhandled activity ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * The amount in whole tokens for a registered token, in base units otherwise, and unlimited for
 * an approval. The asset is the ERC20, so its badge is the chain it lives on whichever ledger
 * holds it: a vault coin is that ERC20 held on Midnight.
 */
function assetAmount(
  registry: TokenInfoRegistry,
  erc20Address: string,
  amount: bigint | null,
): AssetAmount {
  const info = registry.byErc20Address(erc20Address)
  const network = info === undefined ? ETHEREUM : ORIGIN_NETWORKS[info.origin.kind]
  return {
    assetSymbol: info?.symbol ?? abbreviateHex(erc20Address),
    amount:
      amount === null
        ? UNLIMITED_AMOUNT
        : info === undefined
          ? amount.toString()
          : formatTokenAmount(amount, info.decimals),
    usdValue: '0.00',
    icon: info?.icon ?? NO_ICON,
    networkName: network.name,
    networkIcon: network.icon,
  }
}

function labelOf(asset: AssetAmount): string {
  return `${asset.amount} ${asset.assetSymbol}`
}

/** An approval grants the contract's unlimited allowance, which the row shows in place of an amount. */
export const UNLIMITED_AMOUNT = 'Unlimited'

/** The destination of a deposit stored without its recipient's address. */
export const YOUR_WALLET_LABEL = 'your wallet'

/** The chain of an ERC20 the registry does not know, which can only be the EVM chain the vault serves. */
const ETHEREUM: OriginNetwork = { name: 'Ethereum', icon: BUNDLED_NETWORK_ICONS.ethereum }

const ACTIVITY_KIND_BY_TYPE: Record<ActivityType, ActivityKind> = {
  Deposit: 'deposit',
  Withdraw: 'send',
  Swap: 'swap',
  Supply: 'supply',
  Redeem: 'redeem',
  Approval: 'approval',
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
