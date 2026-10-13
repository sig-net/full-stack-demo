import 'server-only'

import { Interface, type Provider } from 'ethers'
import { z } from 'zod'

import type { Erc20Metadata, Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'

export class Erc20ReaderEthersImpl implements Erc20Reader {
  private readonly provider: Provider

  constructor(provider: Provider) {
    this.provider = provider
  }

  async metadata(erc20Address: string): Promise<Erc20Metadata> {
    const [symbol, name, decimals] = await Promise.all([
      this.read(erc20Address, 'symbol'),
      this.read(erc20Address, 'name'),
      this.read(erc20Address, 'decimals'),
    ])
    return {
      symbol: z.string().parse(symbol),
      name: z.string().parse(name),
      decimals: Number(z.bigint().nonnegative().max(255n).parse(decimals)),
    }
  }

  async balanceOf(erc20Address: string, holder: string): Promise<bigint> {
    return z
      .bigint()
      .nonnegative()
      .parse(await this.read(erc20Address, 'balanceOf', [holder]))
  }

  /** The first return value of a view call, validated by the caller: the chain is an external input. */
  private async read(erc20Address: string, method: string, args: unknown[] = []): Promise<unknown> {
    const data = await this.provider.call({
      to: erc20Address,
      data: ERC20.encodeFunctionData(method, args),
    })
    return ERC20.decodeFunctionResult(method, data)[0]
  }
}

const ERC20 = new Interface([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
])
