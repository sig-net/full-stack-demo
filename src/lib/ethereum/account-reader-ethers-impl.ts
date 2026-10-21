import 'server-only'

import type { Provider } from 'ethers'

import type { EthereumAccountReader } from '@/lib/ethereum/account-reader'
import { FINALIZED_BLOCK_TAG } from '@/lib/ethereum/finality'

export class EthereumAccountReaderEthersImpl implements EthereumAccountReader {
  private readonly provider: Provider

  constructor(provider: Provider) {
    this.provider = provider
  }

  balance(account: string): Promise<bigint> {
    return this.provider.getBalance(account, FINALIZED_BLOCK_TAG)
  }
}
