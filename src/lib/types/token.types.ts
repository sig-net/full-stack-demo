// Core token interface with balance - decimals required (fetched from chain)
export interface Token {
  erc20Address: string;
  symbol: string;
  name: string;
  decimals: number;
  chain: 'ethereum' | 'midnight';
}

// Token with bigint balance (for UI components)
export interface TokenWithBalance extends Token {
  balance: bigint;
  balanceUsd?: string;
}
