/** Reads the market's spot quotes. One read is one request, whatever the number of coins. */
export interface SpotPriceSource {
  /** The USD price of each coin the source quotes, scaled by `USD_PRICE_DECIMALS`, keyed by coin id. A coin the source does not quote is absent. */
  readCoinPrices(coinIds: readonly string[]): Promise<ReadonlyMap<string, bigint>>
}
