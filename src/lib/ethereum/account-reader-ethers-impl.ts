import 'server-only'

import type { Provider } from 'ethers'

import type { EthereumAccountReader } from '@/lib/ethereum/account-reader'

export class EthereumAccountReaderEthersImpl implements EthereumAccountReader {
  private readonly provider: Provider

  constructor(provider: Provider) {
    this.provider = provider
  }

  balance(account: string): Promise<bigint> {
    return this.provider.getBalance(account)
  }
}
