import type { AssetAmount } from '@/lib/asset-amount'

export type ActivityKind = 'send' | 'swap' | 'deposit'

export type ActivityStatus = 'pending' | 'complete'

export interface ActivityAssetDestination {
  readonly kind: 'asset'
  readonly asset: AssetAmount
}

export interface ActivityWalletDestination {
  readonly kind: 'wallet'
  /** Abbreviated by the source in its chain's own format, such as `0x10B4…6dFa`. */
  readonly addressLabel: string
}

export type ActivityDestination = ActivityAssetDestination | ActivityWalletDestination

/** One row of the Activity table. */
export interface ActivityEntry {
  readonly id: string
  readonly kind: ActivityKind
  readonly from: AssetAmount
  readonly to: ActivityDestination
  /** Formatted by the source, such as `July 8, 2025 07:18 PM`. */
  readonly timestampLabel: string
  readonly status: ActivityStatus
  /** Abbreviated by the source, such as `0x10B4…6dFa`. */
  readonly transactionHashLabel: string
}
