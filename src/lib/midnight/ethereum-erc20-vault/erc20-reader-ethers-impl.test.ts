import { Interface, type Provider } from 'ethers'
import { expect, test } from 'vitest'

import type { Erc20Metadata, Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import { Erc20ReaderEthersImpl } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader-ethers-impl'
import { mock } from '@/lib/testing/mock'

const TOKEN = `0x${'cd'.repeat(20)}`
const HOLDER = `0x${'ab'.repeat(20)}`
const SPENDER = `0x${'ef'.repeat(20)}`
const ERC20 = new Interface([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
])

/** Answers each view call with the encoded value for its method, checking it was read at the finalised block. */
function readerAnswering(values: Readonly<Record<string, string | bigint>>): Erc20Reader {
  return new Erc20ReaderEthersImpl(
    mock<Provider>('Provider', {
      call: async ({ to, data, blockTag }) => {
        expect(to).toBe(TOKEN)
        expect(blockTag).toBe('finalized')
        const method = ERC20.parseTransaction({ data: String(data) })?.name ?? ''
        const value = values[method]
        if (value === undefined) throw new Error(`unexpected ${method}`)
        return ERC20.encodeFunctionResult(method, [value])
      },
    }),
  )
}

const cases: ReadonlyArray<{
  name: string
  values: Readonly<Record<string, string | bigint>>
  read: (reader: Erc20Reader) => Promise<bigint | Erc20Metadata>
  expected: bigint | Erc20Metadata
}> = [
  {
    name: 'a balance',
    values: { balanceOf: 7n },
    read: (reader) => reader.balanceOf(TOKEN, HOLDER),
    expected: 7n,
  },
  {
    name: 'an allowance',
    values: { allowance: 9n },
    read: (reader) => reader.allowance(TOKEN, HOLDER, SPENDER),
    expected: 9n,
  },
  {
    name: 'the metadata',
    values: { symbol: 'USDC', name: 'USD Coin', decimals: 6n },
    read: (reader) => reader.metadata(TOKEN),
    expected: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  },
]

test.each(cases)('$name is read at the finalised block', async ({ values, read, expected }) => {
  expect(await read(readerAnswering(values))).toEqual(expected)
})
