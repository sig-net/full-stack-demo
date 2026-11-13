/** Read-only prices from a Uniswap V3 quoter on the configured chain. One call is one RPC round trip. */
export interface UniswapQuoter {
  /** The output `amountIn` of `tokenIn` buys in the pool of `fee`, or undefined when no such pool prices the pair. */
  quoteExactInputSingle(args: QuoteExactInputSingleArgs): Promise<bigint | undefined>
}

export interface QuoteExactInputSingleArgs {
  /** `0x` plus 40 hex characters, both of them. */
  readonly tokenIn: string
  readonly tokenOut: string
  readonly amountIn: bigint
  /** The Uniswap V3 pool fee tier, such as 500 or 3000. */
  readonly fee: bigint
}
