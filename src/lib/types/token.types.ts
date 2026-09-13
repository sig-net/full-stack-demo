/** Token metadata with contract-reported precision for exact amount conversion. */
export interface Token {
  erc20Address: string;
  symbol: string;
  name: string;
  decimals: number;
  chain: "ethereum" | "midnight";
}

/** Observed token balance in base units with an optional formatted USD valuation. */
export interface TokenWithBalance extends Token {
  balance: bigint;
  balanceUsd?: string;
}
