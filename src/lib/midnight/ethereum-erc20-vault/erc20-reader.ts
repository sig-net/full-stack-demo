/** Finalised reads of an ERC20 contract on the configured chain. One call is one RPC round trip. */
export interface Erc20Reader {
  metadata(erc20Address: string): Promise<Erc20Metadata>
  /** The holder's balance in the token's base units. */
  balanceOf(erc20Address: string, holder: string): Promise<bigint>
  /** What `spender` may still move from `owner`, in the token's base units. */
  allowance(erc20Address: string, owner: string, spender: string): Promise<bigint>
}

export interface Erc20Metadata {
  readonly symbol: string
  readonly name: string
  readonly decimals: number
}
