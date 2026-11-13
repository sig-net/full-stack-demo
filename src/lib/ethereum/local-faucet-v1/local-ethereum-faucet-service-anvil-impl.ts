import 'server-only'

import {
  AbiCoder,
  type BlockTag,
  Interface,
  type JsonRpcApiProvider,
  keccak256,
  toBeHex,
  toBigInt,
} from 'ethers'

import { FINALIZED_BLOCK_TAG } from '@/lib/ethereum/finality'
import type { AccountFunding } from '@/lib/ethereum/local-faucet-v1/account-funding'
import type { Erc20Funding } from '@/lib/ethereum/local-faucet-v1/erc20-funding'
import {
  FAUCET_AMOUNT,
  type FundAccountArgs,
  type FundErc20Args,
  type LocalEthereumFaucetService,
} from '@/lib/ethereum/local-faucet-v1/local-ethereum-faucet-service'

/** The faucet over anvil's `anvil_setBalance` and `anvil_setStorageAt`, which no other node answers. */
export class LocalEthereumFaucetServiceAnvilImpl implements LocalEthereumFaucetService {
  private readonly provider: JsonRpcApiProvider

  constructor(provider: JsonRpcApiProvider) {
    this.provider = provider
  }

  async fundAccount({ account, amount = FAUCET_AMOUNT }: FundAccountArgs): Promise<AccountFunding> {
    const before = await this.provider.getBalance(account)
    await this.provider.send('anvil_setBalance', [account, toBeHex(before + amount)])
    await this.finalise()
    return { account, balance: await this.provider.getBalance(account, FINALIZED_BLOCK_TAG) }
  }

  async fundErc20({ account, erc20Address, amount }: FundErc20Args): Promise<Erc20Funding> {
    const before = await this.balanceOf(erc20Address, account)
    const location = await this.balanceLocation(erc20Address, account, before)
    await this.provider.send('anvil_setStorageAt', [
      erc20Address,
      location,
      toBeHex(before + amount, 32),
    ])
    await this.finalise()
    return {
      account,
      erc20Address,
      balance: await this.balanceOf(erc20Address, account, FINALIZED_BLOCK_TAG),
    }
  }

  /** Anvil finalises two blocks behind its head, so the write is in the finalised state once two more are mined. */
  private async finalise(): Promise<void> {
    await this.provider.send('anvil_mine', [toBeHex(ANVIL_FINALITY_DEPTH)])
  }

  private async balanceOf(
    erc20Address: string,
    holder: string,
    blockTag: BlockTag = 'latest',
  ): Promise<bigint> {
    return toBigInt(
      await this.provider.call({
        to: erc20Address,
        data: ERC20.encodeFunctionData('balanceOf', [holder]),
        blockTag,
      }),
    )
  }

  /**
   * The holder's slot in the token's balance mapping, found by writing a sentinel at the location
   * each candidate mapping slot implies (Solidity and Vyper layouts) and reading `balanceOf` back,
   * restoring the word either way. A token whose balance lives behind a proxy or in another
   * contract has no such slot and is refused.
   */
  private async balanceLocation(
    erc20Address: string,
    holder: string,
    current: bigint,
  ): Promise<string> {
    const abi = AbiCoder.defaultAbiCoder()
    const sentinel = current === SENTINEL ? SENTINEL + 1n : SENTINEL
    for (let slot = 0; slot < MAPPING_SLOTS_PROBED; slot++) {
      const candidates = [
        keccak256(abi.encode(['address', 'uint256'], [holder, slot])),
        keccak256(abi.encode(['uint256', 'address'], [slot, holder])),
      ]
      for (const location of candidates) {
        const original = await this.provider.getStorage(erc20Address, location)
        await this.provider.send('anvil_setStorageAt', [
          erc20Address,
          location,
          toBeHex(sentinel, 32),
        ])
        const observed = await this.balanceOf(erc20Address, holder)
        await this.provider.send('anvil_setStorageAt', [erc20Address, location, original])
        if (observed === sentinel) return location
      }
    }
    throw new Error(
      `No balance slot of ${erc20Address} was found in the first ${String(MAPPING_SLOTS_PROBED)} storage slots, so the faucet cannot fund it.`,
    )
  }
}

const ERC20 = new Interface(['function balanceOf(address) view returns (uint256)'])

/** A balance no real account holds, so reading it back proves the probed slot. */
const SENTINEL = 1_337_733_113_377_331n

const MAPPING_SLOTS_PROBED = 64

const ANVIL_FINALITY_DEPTH = 2
