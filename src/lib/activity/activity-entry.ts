import type { AssetAmount } from '@/lib/asset-amount'
import type {
  ActivityAction,
  ActivityStep,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress'

/** One row of the Activity table, as the view model the row renders. */
export interface ActivityEntry {
  /** The activity's resource name, the row's key and the argument of every action on it. */
  readonly name: string
  readonly kind: ActivityKind
  /** The activity in a phrase that follows "the", such as `deposit of 100 USDC`. */
  readonly description: string
  readonly from: AssetAmount
  readonly to: ActivityDestination
  /** Formatted by the source, such as `July 8, 2025 07:18 PM`. */
  readonly timestampLabel: string
  readonly status: ActivityStatus
  /** What the user must do next, if anything. */
  readonly action: ActivityAction
  readonly steps: readonly ActivityStep[]
  /** Why the activity failed, once it has. */
  readonly error: string | null
}

export type ActivityKind = 'deposit' | 'send' | 'swap' | 'approval'

/** The kind as the table and its dialog name it: a withdrawal is a Send, since it pays an address on the foreign chain. */
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  deposit: 'Deposit',
  send: 'Send',
  swap: 'Swap',
  approval: 'Approval',
}

export type ActivityStatus = 'pending' | 'complete' | 'failed'

export interface ActivityAssetDestination {
  readonly kind: 'asset'
  readonly asset: AssetAmount
}

export interface ActivityWalletDestination {
  readonly kind: 'wallet'
  /** The full address, for the hover title, null when the row holds no address. */
  readonly address: string | null
  /** Abbreviated by the source in its chain's own format, such as `0x10B4…6dFa`. */
  readonly addressLabel: string
}

export type ActivityDestination = ActivityAssetDestination | ActivityWalletDestination
