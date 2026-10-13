import { type JsonRpcApiProvider, toBeHex } from 'ethers'
import { describe, expect, test } from 'vitest'

import { LocalFaucetServiceAnvilImpl } from '@/lib/ethereum/local-faucet-v1/local-faucet-service-anvil-impl'
import { FAUCET_AMOUNT } from '@/lib/ethereum/local-faucet-v1/local-faucet-service'
import { mock } from '@/lib/testing/mock'

const ACCOUNT = `0x${'ab'.repeat(20)}`

describe('LocalFaucetServiceAnvilImpl.fundAccount', () => {
  test.each([
    { name: 'an empty account ends with the faucet amount', before: 0n },
    { name: 'a funded account keeps what it had', before: 5n * 10n ** 18n },
  ])('$name', async ({ before }) => {
    let balance = before
    const sent: unknown[][] = []
    const provider = mock<JsonRpcApiProvider>('JsonRpcApiProvider', {
      getBalance: () => Promise.resolve(balance),
      send: (method: string, params: unknown[]) => {
        sent.push([method, ...params])
        balance = BigInt(String(params[1]))
        return Promise.resolve(null)
      },
    })
    await expect(
      new LocalFaucetServiceAnvilImpl(provider).fundAccount({ account: ACCOUNT }),
    ).resolves.toEqual({
      account: ACCOUNT,
      balance: before + FAUCET_AMOUNT,
    })
    expect(sent).toEqual([['anvil_setBalance', ACCOUNT, toBeHex(before + FAUCET_AMOUNT)]])
  })
})
