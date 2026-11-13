/** Reads of an ERC-4626 wrapper on the configured chain. One call is a few RPC round trips. */
export interface Erc4626Reader {
  /** The underlying a whole share redeems for now, in the underlying's base units, with that token's decimals. */
  assetsPerShare(wrapperErc20Address: string): Promise<AssetsPerShare>
}

export interface AssetsPerShare {
  readonly assets: bigint
  readonly assetDecimals: number
}
