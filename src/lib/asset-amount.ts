import type { IconSource } from '@/lib/icon-source'

/** An amount of one asset on one network, as the Balances and Activity sections show it. */
export interface AssetAmount {
  readonly assetSymbol: string
  /** The chain the asset came from, which the icon badge shows. */
  readonly networkName: string
  /** Exact decimal amount in whole tokens, such as `0.013`. */
  readonly amount: string
  /** Exact decimal value in US dollars, such as `1470.67`. */
  readonly usdValue: string
  readonly icon: IconSource
  readonly networkIcon: IconSource
}
