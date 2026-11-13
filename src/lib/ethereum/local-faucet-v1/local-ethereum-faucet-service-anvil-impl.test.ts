import { AbiCoder, Interface, type JsonRpcApiProvider, keccak256, toBeHex } from 'ethers'
import { describe, expect, test } from 'vitest'

import { LocalEthereumFaucetServiceAnvilImpl } from '@/lib/ethereum/local-faucet-v1/local-ethereum-faucet-service-anvil-impl'
import { FAUCET_AMOUNT } from '@/lib/ethereum/local-faucet-v1/local-ethereum-faucet-service'
import { mock } from '@/lib/testing/mock'

const ACCOUNT = `0x${'ab'.repeat(20)}`
const TOKEN = `0x${'cd'.repeat(20)}`
const ERC20 = new Interface(['function balanceOf(address) view returns (uint256)'])
const ZERO_WORD = toBeHex(0n, 32)

describe('LocalEthereumFaucetServiceAnvilImpl.fundAccount', () => {
  test.each([
    { name: 'an empty account ends with the faucet amount', before: 0n },
    { name: 'a funded account keeps what it had', before: 5n * 10n ** 18n },
  ])('$name', async ({ before }) => {
    let balance = before
    let finalised = before
    const sent: unknown[][] = []
    const provider = mock<JsonRpcApiProvider>('JsonRpcApiProvider', {
      getBalance: (_account: unknown, blockTag?: unknown) =>
        Promise.resolve(blockTag === 'finalized' ? finalised : balance),
      send: (method: string, params: unknown[]) => {
        sent.push([method, ...params])
        if (method === 'anvil_mine') finalised = balance
        else balance = BigInt(String(params[1]))
        return Promise.resolve(null)
      },
    })
    await expect(
      new LocalEthereumFaucetServiceAnvilImpl(provider).fundAccount({ account: ACCOUNT }),
    ).resolves.toEqual({ account: ACCOUNT, balance: before + FAUCET_AMOUNT })
    expect(sent).toEqual([
      ['anvil_setBalance', ACCOUNT, toBeHex(before + FAUCET_AMOUNT)],
      ['anvil_mine', toBeHex(2)],
    ])
  })
})

/**
 * A token whose balance mapping sits at `slot` in the given layout, as a storage map the provider
 * reads and writes, and a finalised copy of it that only `anvil_mine` brings up to date.
 */
function tokenOver(slot: number | null, layout: 'solidity' | 'vyper' = 'solidity') {
  const abi = AbiCoder.defaultAbiCoder()
  const storage = new Map<string, string>()
  let finalised = new Map<string, string>()
  const balanceLocation =
    slot === null
      ? null
      : layout === 'solidity'
        ? keccak256(abi.encode(['address', 'uint256'], [ACCOUNT, slot]))
        : keccak256(abi.encode(['uint256', 'address'], [slot, ACCOUNT]))
  const provider = mock<JsonRpcApiProvider>('JsonRpcApiProvider', {
    call: ({ data, blockTag }: { data?: string | null; blockTag?: unknown }) => {
      const [holder] = ERC20.decodeFunctionData('balanceOf', String(data))
      if (String(holder).toLowerCase() !== ACCOUNT) throw new Error('unexpected holder')
      const read = blockTag === 'finalized' ? finalised : storage
      return Promise.resolve(
        balanceLocation === null ? ZERO_WORD : (read.get(balanceLocation) ?? ZERO_WORD),
      )
    },
    getStorage: (_address: unknown, position: unknown) =>
      Promise.resolve(storage.get(String(position)) ?? ZERO_WORD),
    send: (method: string, params: unknown[]) => {
      if (method === 'anvil_mine') {
        finalised = new Map(storage)
        return Promise.resolve(null)
      }
      if (method !== 'anvil_setStorageAt') throw new Error(`unexpected ${method}`)
      const [, location, word] = params
      if (word === ZERO_WORD) storage.delete(String(location))
      else storage.set(String(location), String(word))
      return Promise.resolve(null)
    },
  })
  return { provider, storage, balanceLocation }
}

describe('LocalEthereumFaucetServiceAnvilImpl.fundErc20', () => {
  test.each([
    { name: 'a Solidity mapping at slot 0', slot: 0, layout: 'solidity' as const, before: 0n },
    {
      name: 'a Solidity mapping at slot 9 with a prior balance',
      slot: 9,
      layout: 'solidity' as const,
      before: 7n,
    },
    { name: 'a Vyper mapping at slot 3', slot: 3, layout: 'vyper' as const, before: 0n },
  ])('funds $name and restores every probed word', async ({ slot, layout, before }) => {
    const { provider, storage, balanceLocation } = tokenOver(slot, layout)
    if (balanceLocation === null) throw new Error('unreachable')
    if (before > 0n) storage.set(balanceLocation, toBeHex(before, 32))
    await expect(
      new LocalEthereumFaucetServiceAnvilImpl(provider).fundErc20({
        account: ACCOUNT,
        erc20Address: TOKEN,
        amount: 5n,
      }),
    ).resolves.toEqual({ account: ACCOUNT, erc20Address: TOKEN, balance: before + 5n })
    expect([...storage.entries()]).toEqual([[balanceLocation, toBeHex(before + 5n, 32)]])
  })

  test('refuses a token whose balance is not in a probed slot, leaving storage untouched', async () => {
    const { provider, storage } = tokenOver(null)
    await expect(
      new LocalEthereumFaucetServiceAnvilImpl(provider).fundErc20({
        account: ACCOUNT,
        erc20Address: TOKEN,
        amount: 5n,
      }),
    ).rejects.toThrow('No balance slot')
    expect(storage.size).toBe(0)
  })
})
