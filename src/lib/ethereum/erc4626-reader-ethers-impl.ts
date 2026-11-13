import 'server-only'

import { Interface, type Provider } from 'ethers'
import { z } from 'zod'

import type { AssetsPerShare, Erc4626Reader } from '@/lib/ethereum/erc4626-reader'

export class Erc4626ReaderEthersImpl implements Erc4626Reader {
  private readonly provider: Provider

  constructor(provider: Provider) {
    this.provider = provider
  }

  async assetsPerShare(wrapperErc20Address: string): Promise<AssetsPerShare> {
    const [shareDecimals, asset] = await Promise.all([
      this.read(wrapperErc20Address, 'decimals'),
      this.read(wrapperErc20Address, 'asset'),
    ])
    const assetAddress = z.string().parse(asset)
    const [assets, assetDecimals] = await Promise.all([
      this.read(wrapperErc20Address, 'convertToAssets', [
        10n ** decimalsSchema.parse(shareDecimals),
      ]),
      this.read(assetAddress, 'decimals'),
    ])
    return {
      assets: z.bigint().nonnegative().parse(assets),
      assetDecimals: Number(decimalsSchema.parse(assetDecimals)),
    }
  }

  /** The first return value of a view call, validated by the caller: the chain is an external input. */
  private async read(address: string, method: string, args: unknown[] = []): Promise<unknown> {
    const data = await this.provider.call({
      to: address,
      data: ERC4626.encodeFunctionData(method, args),
    })
    return ERC4626.decodeFunctionResult(method, data)[0]
  }
}

const decimalsSchema = z.bigint().nonnegative().max(255n)

const ERC4626 = new Interface([
  'function decimals() view returns (uint8)',
  'function asset() view returns (address)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
])
