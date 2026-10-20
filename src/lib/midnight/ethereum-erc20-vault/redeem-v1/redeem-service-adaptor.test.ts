import { describe, expect, test } from 'vitest'

import type {
  RedeemCompleteInputs,
  RedeemStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import {
  REDEEM_NAME,
  redeemFixture,
  STATA_ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-fixtures'
import type { RedeemService } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service'
import {
  type RedeemResult,
  RedeemServiceAdaptor,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-adaptor'
import { RedeemStateConflict } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-controller'
import { SponsoredCallMismatch } from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const CALLER_SECRET = 'ab'.repeat(32)
const redeem = redeemFixture()
const REQUEST = { shares: 300_000n }
const BOUND_TX = `0x${'B0BD'.repeat(2)}`
const PARSED_BOUND_TX = 'b0bd'.repeat(2)
const START_INPUTS: RedeemStartInputs = { inIndex: 42n, stataErc20Address: STATA_ERC20_ADDRESS }
const COMPLETE_INPUTS: RedeemCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: ATTESTATION_FIELDS.attestationOutputKind,
  attestationOutput: ATTESTATION_FIELDS.attestationOutput,
}

function adaptorOver(service: Partial<RedeemService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new RedeemServiceAdaptor(
    mock<RedeemService>('RedeemService', {
      prepareStartRedeem: recording(START_INPUTS),
      startRedeem: recording(redeem),
      prepareCompleteRedeem: recording(COMPLETE_INPUTS),
      completeRedeem: recording(redeem),
      getRedeem: recording(redeem),
      listRedeems: recording([redeem]),
      ...service,
    }),
    new RecordingLogger(),
  )
}

describe('RedeemServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: RedeemServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'prepareStartRedeem carries the shares as a bigint',
      call: (a) => a.prepareStartRedeem(CALLER_SECRET, { redeemRequest: { shares: '300000' } }),
      expectReceived: [{ redeemRequest: REQUEST }],
    },
    {
      name: 'prepareStartRedeem refuses zero shares',
      call: (a) => a.prepareStartRedeem(CALLER_SECRET, { redeemRequest: { shares: 0n } }),
      expectReceived: [],
      expectError: 'redeemRequest.shares',
    },
    {
      name: 'startRedeem carries the shares, the slot and the bound bytes normalised',
      call: (a) =>
        a.startRedeem(CALLER_SECRET, {
          redeemRequest: { shares: '300000' },
          inIndex: '42',
          boundTx: BOUND_TX,
        }),
      expectReceived: [{ redeemRequest: REQUEST, inIndex: 42n, boundTx: PARSED_BOUND_TX }],
    },
    {
      name: 'startRedeem refuses zero shares',
      call: (a) =>
        a.startRedeem(CALLER_SECRET, {
          redeemRequest: { shares: 0n },
          inIndex: 42n,
          boundTx: BOUND_TX,
        }),
      expectReceived: [],
      expectError: 'redeemRequest.shares',
    },
    {
      name: 'startRedeem refuses bound bytes that are not hex',
      call: (a) =>
        a.startRedeem(CALLER_SECRET, { redeemRequest: REQUEST, inIndex: 42n, boundTx: 'zz' }),
      expectReceived: [],
      expectError: 'boundTx',
    },
    {
      name: 'startRedeem refuses a missing slot',
      call: (a) => a.startRedeem(CALLER_SECRET, { redeemRequest: REQUEST, boundTx: BOUND_TX }),
      expectReceived: [],
      expectError: 'inIndex',
    },
    {
      name: 'prepareCompleteRedeem passes the name',
      call: (a) => a.prepareCompleteRedeem(CALLER_SECRET, { name: REDEEM_NAME }),
      expectReceived: [{ name: REDEEM_NAME }],
    },
    {
      name: 'completeRedeem passes the name and the bound bytes',
      call: (a) => a.completeRedeem(CALLER_SECRET, { name: REDEEM_NAME, boundTx: BOUND_TX }),
      expectReceived: [{ name: REDEEM_NAME, boundTx: PARSED_BOUND_TX }],
    },
    {
      name: 'completeRedeem refuses a name that is not a redeem',
      call: (a) => a.completeRedeem(CALLER_SECRET, { name: 'redeems/1', boundTx: BOUND_TX }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-redeems/{uuid}',
    },
    {
      name: 'completeRedeem refuses missing bound bytes',
      call: (a) => a.completeRedeem(CALLER_SECRET, { name: REDEEM_NAME }),
      expectReceived: [],
      expectError: 'boundTx',
    },
    {
      name: 'getRedeem passes the name',
      call: (a) => a.getRedeem(CALLER_SECRET, { name: REDEEM_NAME }),
      expectReceived: [{ name: REDEEM_NAME }],
    },
    {
      name: 'listRedeems takes no arguments',
      call: (a) => a.listRedeems(CALLER_SECRET, {}),
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

describe('RedeemServiceAdaptor outcomes', () => {
  test('a missing redeem is a not-found result', async () => {
    const adaptor = adaptorOver({ getRedeem: async () => undefined })
    expect(await adaptor.getRedeem(CALLER_SECRET, { name: REDEEM_NAME })).toEqual({
      ok: false,
      error: `${REDEEM_NAME} was not found.`,
    })
  })

  test('the prepare methods answer with the inputs the service assigned or read', async () => {
    const adaptor = adaptorOver({})
    expect(await adaptor.prepareStartRedeem(CALLER_SECRET, { redeemRequest: REQUEST })).toEqual({
      ok: true,
      inputs: START_INPUTS,
    })
    expect(await adaptor.prepareCompleteRedeem(CALLER_SECRET, { name: REDEEM_NAME })).toEqual({
      ok: true,
      inputs: COMPLETE_INPUTS,
    })
  })

  const refusals: ReadonlyArray<[string, Error, RedeemResult | undefined]> = [
    [
      'a state conflict',
      new RedeemStateConflict(REDEEM_NAME, 'AwaitingVaultRequest', 'complete'),
      {
        ok: false,
        error: `${REDEEM_NAME} is AwaitingVaultRequest, which does not allow complete`,
      },
    ],
    [
      'bound bytes that are not the expected vault call',
      new SponsoredCallMismatch('startRedeem'),
      {
        ok: false,
        error:
          'the bound bytes must be exactly one startRedeem call to the vault, spending shielded coins alone',
      },
    ],
    ['any other error', new Error('indexer down'), undefined],
  ]

  test.each(refusals)('%s from a user action', async (_name, error, expectRefusal) => {
    const refusing = async () => {
      throw error
    }
    const adaptor = adaptorOver({
      startRedeem: refusing,
      prepareCompleteRedeem: refusing,
      completeRedeem: refusing,
    })
    const starting = adaptor.startRedeem(CALLER_SECRET, {
      redeemRequest: REQUEST,
      inIndex: 42n,
      boundTx: BOUND_TX,
    })
    const preparing = adaptor.prepareCompleteRedeem(CALLER_SECRET, { name: REDEEM_NAME })
    const completing = adaptor.completeRedeem(CALLER_SECRET, {
      name: REDEEM_NAME,
      boundTx: BOUND_TX,
    })
    for (const outcome of [starting, preparing, completing]) {
      if (expectRefusal === undefined) await expect(outcome).rejects.toThrow(error.message)
      else expect(await outcome).toEqual(expectRefusal)
    }
  })
})
