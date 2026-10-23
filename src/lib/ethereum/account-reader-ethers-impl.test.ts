import type { Provider } from 'ethers'
import { expect, test } from 'vitest'

import { EthereumAccountReaderEthersImpl } from '@/lib/ethereum/account-reader-ethers-impl'
import { mock } from '@/lib/testing/mock'

const ACCOUNT = `0x${'ab'.repeat(20)}`

test.each([
  { name: 'an empty account', balance: 0n },
  { name: 'a funded account', balance: 5n * 10n ** 18n },
])('the balance of $name is read at the finalised block', async ({ balance }) => {
  const provider = mock<Provider>('Provider', {
    getBalance: async (account, blockTag) => {
      expect(account).toBe(ACCOUNT)
      expect(blockTag).toBe('finalized')
      return balance
    },
  })
  expect(await new EthereumAccountReaderEthersImpl(provider).balance(ACCOUNT)).toBe(balance)
})
