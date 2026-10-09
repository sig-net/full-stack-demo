import { describe, expect, test } from 'vitest'

import {
  DEPOSIT_NAME,
  depositFixture,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import type { DepositService } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import { DepositServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import { DepositStateConflict } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import { mock } from '@/lib/testing/mock'

const CALLER_SECRET = 'ab'.repeat(32)
const WALLET = { coinPublicKey: `0x${'AA'.repeat(32)}`, encryptionPublicKey: 'bb'.repeat(32) }
const PARSED_WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const deposit = depositFixture()

function adaptorOver(service: Partial<DepositService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new DepositServiceAdaptor(
    mock<DepositService>('DepositService', {
      startDeposit: recording(deposit),
      completeDeposit: recording(deposit),
      getDeposit: recording(deposit),
      listDeposits: recording([deposit]),
      ...service,
    }),
  )
}

describe('DepositServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: DepositServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'startDeposit normalises the wallet keys and carries the amount as a bigint',
      call: (a) =>
        a.startDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: '1000000' },
          wallet: WALLET,
        }),
      expectReceived: [
        {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1_000_000n },
          wallet: PARSED_WALLET,
        },
      ],
    },
    {
      name: 'startDeposit refuses a wallet key that is not 32 bytes',
      call: (a) =>
        a.startDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1n },
          wallet: { ...WALLET, coinPublicKey: 'aa' },
        }),
      expectReceived: [],
      expectError: 'expected a 32-byte key in hex',
    },
    {
      name: 'startDeposit refuses a zero amount',
      call: (a) =>
        a.startDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 0n },
          wallet: WALLET,
        }),
      expectReceived: [],
      expectError: 'depositRequest.amount',
    },
    {
      name: 'completeDeposit passes the name and the wallet',
      call: (a) => a.completeDeposit(CALLER_SECRET, { name: DEPOSIT_NAME, wallet: WALLET }),
      expectReceived: [{ name: DEPOSIT_NAME, wallet: PARSED_WALLET }],
    },
    {
      name: 'completeDeposit refuses a name that is not a deposit',
      call: (a) => a.completeDeposit(CALLER_SECRET, { name: 'deposits/1', wallet: WALLET }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-deposits/{uuid}',
    },
    {
      name: 'getDeposit passes the name',
      call: (a) => a.getDeposit(CALLER_SECRET, { name: DEPOSIT_NAME }),
      expectReceived: [{ name: DEPOSIT_NAME }],
    },
    {
      name: 'listDeposits takes no arguments',
      call: (a) => a.listDeposits(CALLER_SECRET, {}),
      expectReceived: [{}],
    },
    {
      name: 'listDeposits refuses a non-object',
      call: (a) => a.listDeposits(CALLER_SECRET, 'all'),
      expectReceived: [],
      expectError: 'expected object',
    },
  ]

  test.each(cases)('$name', async ({ call, expectReceived, expectError }) => {
    const received: object[] = []
    const result = await call(adaptorOver({}, received))
    expect(received).toEqual(expectReceived)
    if (expectError === undefined) expect(result.ok).toBe(true)
    else expect(result).toMatchObject({ ok: false, error: expect.stringContaining(expectError) })
  })

  test('an invalid caller secret throws before anything is parsed', async () => {
    await expect(adaptorOver({}).getDeposit('nope', { name: DEPOSIT_NAME })).rejects.toThrow(
      'caller secret',
    )
  })
})

describe('DepositServiceAdaptor outcomes', () => {
  test('a missing deposit is a not-found result', async () => {
    const adaptor = adaptorOver({ getDeposit: async () => undefined })
    expect(await adaptor.getDeposit(CALLER_SECRET, { name: DEPOSIT_NAME })).toEqual({
      ok: false,
      error: `${DEPOSIT_NAME} was not found.`,
    })
  })

  const refusals: ReadonlyArray<[string, Error, string | undefined]> = [
    [
      'a state conflict',
      new DepositStateConflict(DEPOSIT_NAME, 'AwaitingVaultRequest', 'completeDeposit'),
      `${DEPOSIT_NAME} is AwaitingVaultRequest, which does not allow completeDeposit`,
    ],
    [
      'the contract refusing the call at build time',
      new Error('failed assert: Token not allowed'),
      'failed assert: Token not allowed',
    ],
    ['any other error', new Error('indexer down'), undefined],
  ]

  test.each(refusals)('%s from a user action', async (_name, error, expectMessage) => {
    const adaptor = adaptorOver({
      startDeposit: async () => {
        throw error
      },
      completeDeposit: async () => {
        throw error
      },
    })
    const starting = adaptor.startDeposit(CALLER_SECRET, {
      depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1n },
      wallet: WALLET,
    })
    const completing = adaptor.completeDeposit(CALLER_SECRET, {
      name: DEPOSIT_NAME,
      wallet: WALLET,
    })
    for (const acting of [starting, completing]) {
      if (expectMessage === undefined) await expect(acting).rejects.toBe(error)
      else expect(await acting).toEqual({ ok: false, error: expectMessage })
    }
  })
})
