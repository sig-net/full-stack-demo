import { describe, expect, test } from 'vitest'

import { LocalFaucetServiceAdaptor } from '@/lib/ethereum/local-faucet-v1/local-faucet-service-adaptor'
import type { LocalFaucetService } from '@/lib/ethereum/local-faucet-v1/local-faucet-service'
import { mock } from '@/lib/testing/mock'

const ACCOUNT = `0x${'ab'.repeat(20)}`

function adaptorOver(accounts: string[] = []): LocalFaucetServiceAdaptor {
  return new LocalFaucetServiceAdaptor(
    mock<LocalFaucetService>('LocalFaucetService', {
      fundAccount: ({ account }) => {
        accounts.push(account)
        return Promise.resolve({ account, balance: 7n })
      },
    }),
  )
}

describe('LocalFaucetServiceAdaptor.fundAccount', () => {
  test('lower-cases the account and answers the funding', async () => {
    const accounts: string[] = []
    await expect(
      adaptorOver(accounts).fundAccount({ account: ACCOUNT.toUpperCase().replace('0X', '0x') }),
    ).resolves.toEqual({
      ok: true,
      funding: { account: ACCOUNT, balance: 7n },
    })
    expect(accounts).toEqual([ACCOUNT])
  })

  test.each([
    { name: 'a missing account', args: {} },
    { name: 'a non-address account', args: { account: 'nope' } },
    { name: 'arguments that are not an object', args: 'no' },
  ])('refuses $name', async ({ args }) => {
    await expect(adaptorOver().fundAccount(args)).resolves.toMatchObject({ ok: false })
  })

  test('refuses every call outside the local stack', async () => {
    await expect(
      new LocalFaucetServiceAdaptor(null).fundAccount({ account: ACCOUNT }),
    ).resolves.toEqual({
      ok: false,
      error: 'The faucet is available on the local stack only.',
    })
  })
})
