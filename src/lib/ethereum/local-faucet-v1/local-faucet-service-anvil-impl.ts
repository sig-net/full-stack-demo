import 'server-only'

import { type JsonRpcApiProvider, toBeHex } from 'ethers'

import type { AccountFunding } from '@/lib/ethereum/local-faucet-v1/account-funding'
import {
  FAUCET_AMOUNT,
  type FundAccountArgs,
  type LocalFaucetService,
} from '@/lib/ethereum/local-faucet-v1/local-faucet-service'

/** The faucet over anvil's `anvil_setBalance`, which no other node answers. */
export class LocalFaucetServiceAnvilImpl implements LocalFaucetService {
  private readonly provider: JsonRpcApiProvider

  constructor(provider: JsonRpcApiProvider) {
    this.provider = provider
  }

  async fundAccount({ account }: FundAccountArgs): Promise<AccountFunding> {
    const before = await this.provider.getBalance(account)
    await this.provider.send('anvil_setBalance', [account, toBeHex(before + FAUCET_AMOUNT)])
    return { account, balance: await this.provider.getBalance(account) }
  }
}
