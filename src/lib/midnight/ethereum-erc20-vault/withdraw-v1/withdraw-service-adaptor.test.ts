import { describe, expect, test } from 'vitest'

import { SponsoredCallMismatch } from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type {
  WithdrawCompleteInputs,
  WithdrawStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import {
  DESTINATION,
  ERC20_ADDRESS,
  WITHDRAW_NAME,
  withdrawFixture,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-fixtures'
import type { WithdrawService } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import {
  type WithdrawResult,
  WithdrawServiceAdaptor,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-adaptor'
import { WithdrawStateConflict } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-controller'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const CALLER_SECRET = 'ab'.repeat(32)
const withdraw = withdrawFixture()
const REQUEST = { erc20Address: ERC20_ADDRESS, amount: 1_000_000n, destEvmAddress: DESTINATION }
const BOUND_TX = `0x${'B0BD'.repeat(2)}`
const PARSED_BOUND_TX = 'b0bd'.repeat(2)
const START_INPUTS: WithdrawStartInputs = { inIndex: 42n }
const COMPLETE_INPUTS: WithdrawCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: ATTESTATION_FIELDS.attestationOutputKind,
  attestationOutput: ATTESTATION_FIELDS.attestationOutput,
}

function adaptorOver(service: Partial<WithdrawService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new WithdrawServiceAdaptor(
    mock<WithdrawService>('WithdrawService', {
      prepareStartWithdraw: recording(START_INPUTS),
      startWithdraw: recording(withdraw),
      prepareCompleteWithdraw: recording(COMPLETE_INPUTS),
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
      name: 'prepareStartWithdraw carries the request with the amount as a bigint',
      call: (a) =>
        a.prepareStartWithdraw(CALLER_SECRET, {
          withdrawRequest: { ...REQUEST, amount: '1000000' },
        }),
      expectReceived: [{ withdrawRequest: REQUEST }],
    },
    {
      name: 'startWithdraw carries the request, the slot and the bound bytes normalised',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, {
          withdrawRequest: { ...REQUEST, amount: '1000000' },
          inIndex: '42',
          boundTx: BOUND_TX,
        }),
      expectReceived: [{ withdrawRequest: REQUEST, inIndex: 42n, boundTx: PARSED_BOUND_TX }],
    },
    {
      name: 'startWithdraw lower-cases a checksummed destination',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, {
          withdrawRequest: {
            ...REQUEST,
            destEvmAddress: DESTINATION.toUpperCase().replace('0X', '0x'),
          },
          inIndex: 42n,
          boundTx: BOUND_TX,
        }),
      expectReceived: [{ withdrawRequest: REQUEST, inIndex: 42n, boundTx: PARSED_BOUND_TX }],
    },
    {
      name: 'startWithdraw refuses a zero amount',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, {
          withdrawRequest: { ...REQUEST, amount: 0n },
          inIndex: 42n,
          boundTx: BOUND_TX,
        }),
      expectReceived: [],
      expectError: 'withdrawRequest.amount',
    },
    {
      name: 'startWithdraw refuses a destination that is not an address',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, {
          withdrawRequest: { ...REQUEST, destEvmAddress: '0x1234' },
          inIndex: 42n,
          boundTx: BOUND_TX,
        }),
      expectReceived: [],
      expectError: 'withdrawRequest.destEvmAddress',
    },
    {
      name: 'startWithdraw refuses bound bytes that are not hex',
      call: (a) =>
        a.startWithdraw(CALLER_SECRET, { withdrawRequest: REQUEST, inIndex: 42n, boundTx: 'zz' }),
      expectReceived: [],
      expectError: 'boundTx',
    },
    {
      name: 'startWithdraw refuses a missing slot',
      call: (a) => a.startWithdraw(CALLER_SECRET, { withdrawRequest: REQUEST, boundTx: BOUND_TX }),
      expectReceived: [],
      expectError: 'inIndex',
    },
    {
      name: 'prepareCompleteWithdraw passes the name',
      call: (a) => a.prepareCompleteWithdraw(CALLER_SECRET, { name: WITHDRAW_NAME }),
      expectReceived: [{ name: WITHDRAW_NAME }],
    },
    {
      name: 'completeWithdraw passes the name and the bound bytes',
      call: (a) => a.completeWithdraw(CALLER_SECRET, { name: WITHDRAW_NAME, boundTx: BOUND_TX }),
      expectReceived: [{ name: WITHDRAW_NAME, boundTx: PARSED_BOUND_TX }],
    },
    {
      name: 'completeWithdraw refuses a name that is not a withdrawal',
      call: (a) => a.completeWithdraw(CALLER_SECRET, { name: 'withdraws/1', boundTx: BOUND_TX }),
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
  test('a missing withdrawal is a not-found result', async () => {
    const adaptor = adaptorOver({ getWithdraw: async () => undefined })
    expect(await adaptor.getWithdraw(CALLER_SECRET, { name: WITHDRAW_NAME })).toEqual({
      ok: false,
      error: `${WITHDRAW_NAME} was not found.`,
    })
  })

  test('the prepare methods answer with the inputs the service assigned or read', async () => {
    const adaptor = adaptorOver({})
    expect(await adaptor.prepareStartWithdraw(CALLER_SECRET, { withdrawRequest: REQUEST })).toEqual(
      { ok: true, inputs: START_INPUTS },
    )
    expect(await adaptor.prepareCompleteWithdraw(CALLER_SECRET, { name: WITHDRAW_NAME })).toEqual({
      ok: true,
      inputs: COMPLETE_INPUTS,
    })
  })

  const refusals: ReadonlyArray<[string, Error, WithdrawResult | undefined]> = [
    [
      'a state conflict',
      new WithdrawStateConflict(WITHDRAW_NAME, 'AwaitingVaultRequest', 'complete'),
      {
        ok: false,
        error: `${WITHDRAW_NAME} is AwaitingVaultRequest, which does not allow complete`,
      },
    ],
    [
      'bound bytes that are not the expected vault call',
      new SponsoredCallMismatch('startWithdraw'),
      {
        ok: false,
        error:
          'the bound bytes must be exactly one startWithdraw call to the vault, spending shielded coins alone',
      },
    ],
    ['any other error', new Error('indexer down'), undefined],
  ]

  test.each(refusals)('%s from a user action', async (_name, error, expectRefusal) => {
    const refusing = async () => {
      throw error
    }
    const adaptor = adaptorOver({
      startWithdraw: refusing,
      prepareCompleteWithdraw: refusing,
      completeWithdraw: refusing,
    })
    const starting = adaptor.startWithdraw(CALLER_SECRET, {
      withdrawRequest: REQUEST,
      inIndex: 42n,
      boundTx: BOUND_TX,
    })
    const preparing = adaptor.prepareCompleteWithdraw(CALLER_SECRET, { name: WITHDRAW_NAME })
    const completing = adaptor.completeWithdraw(CALLER_SECRET, {
      name: WITHDRAW_NAME,
      boundTx: BOUND_TX,
    })
    for (const outcome of [starting, preparing, completing]) {
      if (expectRefusal === undefined) await expect(outcome).rejects.toThrow(error.message)
      else expect(await outcome).toEqual(expectRefusal)
    }
  })
})
