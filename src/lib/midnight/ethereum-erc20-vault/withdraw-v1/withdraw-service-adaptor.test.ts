import { describe, expect, test } from 'vitest'

import { mock } from '@/lib/testing/mock'
import {
  DESTINATION,
  ERC20_ADDRESS,
  WITHDRAW_NAME,
  withdrawFixture,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-fixtures'
import type { WithdrawService } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import { WithdrawServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-adaptor'
import { WithdrawStateConflict } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-controller'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const CALLER_SECRET = 'ab'.repeat(32)
const WALLET = { coinPublicKey: `0x${'AA'.repeat(32)}`, encryptionPublicKey: 'bb'.repeat(32) }
const PARSED_WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const withdraw = withdrawFixture()
const REQUEST = { erc20Address: ERC20_ADDRESS, amount: 1_000_000n, destEvmAddress: DESTINATION }

function adaptorOver(service: Partial<WithdrawService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new WithdrawServiceAdaptor(
    mock<WithdrawService>('WithdrawService', {
      startWithdraw: recording(withdraw),
      completeWithdraw: recording(withdraw),
      getWithdraw: recording(withdraw),
      listWithdraws: recording([withdraw]),
      ...service,
    }),
    new RecordingLogger(),
  )
}

describe('WithdrawServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: WithdrawServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'startWithdraw normalises the wallet keys and carries the request with the amount as a bigint',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, {
          withdrawRequest: { ...REQUEST, amount: '1000000' },
          wallet: WALLET,
        }),
      expectReceived: [{ withdrawRequest: REQUEST, wallet: PARSED_WALLET }],
    },
    {
      name: 'startWithdraw lower-cases a checksummed destination',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, {
          withdrawRequest: {
            ...REQUEST,
            destEvmAddress: DESTINATION.toUpperCase().replace('0X', '0x'),
          },
          wallet: WALLET,
        }),
      expectReceived: [{ withdrawRequest: REQUEST, wallet: PARSED_WALLET }],
    },
    {
      name: 'startWithdraw refuses a zero amount',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, {
          withdrawRequest: { ...REQUEST, amount: 0n },
          wallet: WALLET,
        }),
      expectReceived: [],
      expectError: 'withdrawRequest.amount',
    },
    {
      name: 'startWithdraw refuses a destination that is not an address',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, {
          withdrawRequest: { ...REQUEST, destEvmAddress: '0x1234' },
          wallet: WALLET,
        }),
      expectReceived: [],
      expectError: 'withdrawRequest.destEvmAddress',
    },
    {
      name: 'completeWithdraw passes the name and the wallet',
      call: (a) => a.completeWithdraw(CALLER_SECRET, { name: WITHDRAW_NAME, wallet: WALLET }),
      expectReceived: [{ name: WITHDRAW_NAME, wallet: PARSED_WALLET }],
    },
    {
      name: 'completeWithdraw refuses a name that is not a withdrawal',
      call: (a) => a.completeWithdraw(CALLER_SECRET, { name: 'withdraws/1', wallet: WALLET }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-withdraws/{uuid}',
    },
    {
      name: 'getWithdraw passes the name',
      call: (a) => a.getWithdraw(CALLER_SECRET, { name: WITHDRAW_NAME }),
      expectReceived: [{ name: WITHDRAW_NAME }],
    },
    {
      name: 'listWithdraws takes no arguments',
      call: (a) => a.listWithdraws(CALLER_SECRET, {}),
      expectReceived: [{}],
    },
  ]

  test.each(cases)('$name', async ({ call, expectReceived, expectError }) => {
    const received: object[] = []
    const result = await call(adaptorOver({}, received))
    expect(received).toEqual(expectReceived)
    if (expectError === undefined) expect(result.ok).toBe(true)
    else expect(result).toMatchObject({ ok: false, error: expect.stringContaining(expectError) })
  })
})

describe('WithdrawServiceAdaptor outcomes', () => {
  test('a state conflict is a result the caller can act on', async () => {
    const adaptor = adaptorOver({
      completeWithdraw: async () => {
        throw new WithdrawStateConflict(WITHDRAW_NAME, 'AwaitingVaultRequest', 'complete')
      },
    })
    expect(
      await adaptor.completeWithdraw(CALLER_SECRET, { name: WITHDRAW_NAME, wallet: WALLET }),
    ).toEqual({
      ok: false,
      error: `${WITHDRAW_NAME} is AwaitingVaultRequest, which does not allow complete`,
    })
  })

  test("a contract assert at build time is the vault's refusal", async () => {
    const adaptor = adaptorOver({
      startWithdraw: async () => {
        throw new Error('failed assert: erc20Address not allowed')
      },
    })
    expect(
      await adaptor.startWithdraw(CALLER_SECRET, { withdrawRequest: REQUEST, wallet: WALLET }),
    ).toEqual({ ok: false, error: 'erc20Address not allowed' })
  })

  test('any other failure propagates', async () => {
    const adaptor = adaptorOver({
      startWithdraw: async () => {
        throw new Error('indexer down')
      },
    })
    await expect(
      adaptor.startWithdraw(CALLER_SECRET, { withdrawRequest: REQUEST, wallet: WALLET }),
    ).rejects.toThrow('indexer down')
  })
})
