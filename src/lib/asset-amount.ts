/** An amount of one asset on one network, as the Balances and Activity sections show it. */
export interface AssetAmount {
  readonly assetSymbol: string
  readonly networkName: string
  /** Exact decimal amount in whole tokens, such as `0.013`. */
  readonly amount: string
  /** Exact decimal value in US dollars, such as `1470.67`. */
  readonly usdValue: string
}
