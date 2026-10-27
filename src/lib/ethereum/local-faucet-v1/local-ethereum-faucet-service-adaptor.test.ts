import { describe, expect, test } from 'vitest'

import { LocalEthereumFaucetServiceAdaptor } from '@/lib/ethereum/local-faucet-v1/local-ethereum-faucet-service-adaptor'
import type { LocalEthereumFaucetService } from '@/lib/ethereum/local-faucet-v1/local-ethereum-faucet-service'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const ACCOUNT = `0x${'ab'.repeat(20)}`
const TOKEN = `0x${'cd'.repeat(20)}`

function adaptorOver(
  accounts: string[] = [],
  erc20Error?: Error,
): LocalEthereumFaucetServiceAdaptor {
  return new LocalEthereumFaucetServiceAdaptor(
    mock<LocalEthereumFaucetService>('LocalEthereumFaucetService', {
      fundAccount: ({ account }) => {
        accounts.push(account)
        return Promise.resolve({ account, balance: 7n })
      },
      fundErc20: ({ account, erc20Address, amount }) =>
        erc20Error === undefined
          ? Promise.resolve({ account, erc20Address, balance: amount })
          : Promise.reject(erc20Error),
    }),
    new RecordingLogger(),
  )
}

describe('LocalEthereumFaucetServiceAdaptor.fundAccount', () => {
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
    { name: 'a zero amount', args: { account: ACCOUNT, amount: '0' } },
    { name: 'arguments that are not an object', args: 'no' },
  ])('refuses $name', async ({ args }) => {
    await expect(adaptorOver().fundAccount(args)).resolves.toMatchObject({ ok: false })
  })

  test('carries a wei amount past Uint<64> as a bigint', async () => {
    await expect(
      adaptorOver().fundAccount({ account: ACCOUNT, amount: '20000000000000000000' }),
    ).resolves.toMatchObject({ ok: true })
  })

  test('refuses every call outside the local stack', async () => {
    await expect(
      new LocalEthereumFaucetServiceAdaptor(null, new RecordingLogger()).fundAccount({
        account: ACCOUNT,
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'The faucet is available on the local stack only.',
    })
  })
})

describe('LocalEthereumFaucetServiceAdaptor.fundErc20', () => {
  test('answers the funding with the amount as a bigint or a decimal string', async () => {
    await expect(
      adaptorOver().fundErc20({ account: ACCOUNT, erc20Address: TOKEN, amount: '5' }),
    ).resolves.toEqual({
      ok: true,
      funding: { account: ACCOUNT, erc20Address: TOKEN, balance: 5n },
    })
  })

  test.each([
    { name: 'a zero amount', args: { account: ACCOUNT, erc20Address: TOKEN, amount: 0n } },
    { name: 'a missing token', args: { account: ACCOUNT, amount: 1n } },
    { name: 'arguments that are not an object', args: 'no' },
  ])('refuses $name', async ({ args }) => {
    await expect(adaptorOver().fundErc20(args)).resolves.toMatchObject({ ok: false })
  })

  test('reports a token the faucet cannot write as a refusal', async () => {
    await expect(
      adaptorOver([], new Error('No balance slot found')).fundErc20({
        account: ACCOUNT,
        erc20Address: TOKEN,
        amount: 1n,
      }),
    ).resolves.toEqual({ ok: false, error: 'No balance slot found' })
  })

  test('refuses every call outside the local stack', async () => {
    await expect(
      new LocalEthereumFaucetServiceAdaptor(null, new RecordingLogger()).fundErc20({
        account: ACCOUNT,
        erc20Address: TOKEN,
        amount: 1n,
      }),
    ).resolves.toEqual({ ok: false, error: 'The faucet is available on the local stack only.' })
  })
})
