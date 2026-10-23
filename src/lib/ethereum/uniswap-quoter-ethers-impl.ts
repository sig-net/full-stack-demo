import 'server-only'

import { Interface, isCallException, type Provider } from 'ethers'
import { z } from 'zod'

import type { QuoteExactInputSingleArgs, UniswapQuoter } from '@/lib/ethereum/uniswap-quoter'

/** Uniswap's QuoterV2 reverts inside `eth_call` for a pair no pool prices, which reads as no quote. */
export class UniswapQuoterEthersImpl implements UniswapQuoter {
  private readonly provider: Provider
  private readonly quoterAddress: string

  constructor(provider: Provider, quoterAddress: string) {
    this.provider = provider
    this.quoterAddress = quoterAddress
  }

  async quoteExactInputSingle(args: QuoteExactInputSingleArgs): Promise<bigint | undefined> {
    let data: string
    try {
      data = await this.provider.call({
        to: this.quoterAddress,
        data: QUOTER_V2.encodeFunctionData('quoteExactInputSingle', [
          {
            tokenIn: args.tokenIn,
            tokenOut: args.tokenOut,
            amountIn: args.amountIn,
            fee: args.fee,
            sqrtPriceLimitX96: 0n,
          },
        ]),
      })
    } catch (error: unknown) {
      if (isCallException(error)) return undefined
      throw error
    }
    return z
      .bigint()
      .nonnegative()
      .parse(QUOTER_V2.decodeFunctionResult('quoteExactInputSingle', data)[0])
  }
}

const QUOTER_V2 = new Interface([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])
