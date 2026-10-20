import { describe, expect, test } from 'vitest'

import { SponsoredCallMismatch } from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
import type {
  SupplyCompleteInputs,
  SupplyStartInputs,
  SupplyTarget,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import {
  STATA_ERC20_ADDRESS,
  SUPPLY_NAME,
  supplyFixture,
  UNDERLYING_ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-fixtures'
import type { SupplyService } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import {
  type SupplyResult,
  SupplyServiceAdaptor,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service-adaptor'
import { SupplyStateConflict } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const CALLER_SECRET = 'ab'.repeat(32)
const supply = supplyFixture()
const target: SupplyTarget = {
  underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
  stataErc20Address: STATA_ERC20_ADDRESS,
  allowance: 1n,
}
const REQUEST = { amount: 1_000_000n }
const BOUND_TX = `0x${'B0BD'.repeat(2)}`
const PARSED_BOUND_TX = 'b0bd'.repeat(2)
const START_INPUTS: SupplyStartInputs = {
  inIndex: 42n,
  underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
}
const COMPLETE_INPUTS: SupplyCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: ATTESTATION_FIELDS.attestationOutputKind,
  attestationOutput: ATTESTATION_FIELDS.attestationOutput,
}

function adaptorOver(service: Partial<SupplyService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new SupplyServiceAdaptor(
    mock<SupplyService>('SupplyService', {
      getSupplyTarget: recording(target),
      prepareStartSupply: recording(START_INPUTS),
      startSupply: recording(supply),
      prepareCompleteSupply: recording(COMPLETE_INPUTS),
      completeSupply: recording(supply),
      getSupply: recording(supply),
      listSupplies: recording([supply]),
      ...service,
    }),
    new RecordingLogger(),
  )
}

describe('SupplyServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: SupplyServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'getSupplyTarget takes no arguments',
      call: (a) => a.getSupplyTarget(CALLER_SECRET, {}),
      expectReceived: [{}],
    },
    {
      name: 'prepareStartSupply carries the amount as a bigint',
      call: (a) => a.prepareStartSupply(CALLER_SECRET, { supplyRequest: { amount: '1000000' } }),
      expectReceived: [{ supplyRequest: REQUEST }],
    },
    {
      name: 'prepareStartSupply refuses a zero amount',
      call: (a) => a.prepareStartSupply(CALLER_SECRET, { supplyRequest: { amount: 0n } }),
      expectReceived: [],
      expectError: 'supplyRequest.amount',
    },
    {
      name: 'startSupply carries the request, the slot and the bound bytes normalised',
      call: (a) =>
        a.startSupply(CALLER_SECRET, {
          supplyRequest: { amount: '1000000' },
          inIndex: '42',
          boundTx: BOUND_TX,
        }),
      expectReceived: [{ supplyRequest: REQUEST, inIndex: 42n, boundTx: PARSED_BOUND_TX }],
    },
    {
      name: 'startSupply refuses a zero amount',
      call: (a) =>
        a.startSupply(CALLER_SECRET, {
          supplyRequest: { amount: 0n },
          inIndex: 42n,
          boundTx: BOUND_TX,
        }),
      expectReceived: [],
      expectError: 'supplyRequest.amount',
    },
    {
      name: 'startSupply refuses bound bytes that are not hex',
      call: (a) =>
        a.startSupply(CALLER_SECRET, { supplyRequest: REQUEST, inIndex: 42n, boundTx: 'zz' }),
      expectReceived: [],
      expectError: 'boundTx',
    },
    {
      name: 'startSupply refuses a missing slot',
      call: (a) => a.startSupply(CALLER_SECRET, { supplyRequest: REQUEST, boundTx: BOUND_TX }),
      expectReceived: [],
      expectError: 'inIndex',
    },
    {
      name: 'prepareCompleteSupply passes the name',
      call: (a) => a.prepareCompleteSupply(CALLER_SECRET, { name: SUPPLY_NAME }),
      expectReceived: [{ name: SUPPLY_NAME }],
    },
    {
      name: 'completeSupply passes the name and the bound bytes',
      call: (a) => a.completeSupply(CALLER_SECRET, { name: SUPPLY_NAME, boundTx: BOUND_TX }),
      expectReceived: [{ name: SUPPLY_NAME, boundTx: PARSED_BOUND_TX }],
    },
    {
      name: 'completeSupply refuses a name that is not a supply',
      call: (a) => a.completeSupply(CALLER_SECRET, { name: 'supplies/1', boundTx: BOUND_TX }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-supplies/{uuid}',
    },
    {
      name: 'getSupply passes the name',
      call: (a) => a.getSupply(CALLER_SECRET, { name: SUPPLY_NAME }),
      expectReceived: [{ name: SUPPLY_NAME }],
    },
    {
      name: 'listSupplies takes no arguments',
      call: (a) => a.listSupplies(CALLER_SECRET, {}),
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

describe('SupplyServiceAdaptor outcomes', () => {
  test('a missing supply is a not-found result', async () => {
    const adaptor = adaptorOver({ getSupply: async () => undefined })
    expect(await adaptor.getSupply(CALLER_SECRET, { name: SUPPLY_NAME })).toEqual({
      ok: false,
      error: `${SUPPLY_NAME} was not found.`,
    })
  })

  test('the prepare methods answer with the inputs the service assigned or read', async () => {
    const adaptor = adaptorOver({})
    expect(await adaptor.prepareStartSupply(CALLER_SECRET, { supplyRequest: REQUEST })).toEqual({
      ok: true,
      inputs: START_INPUTS,
    })
    expect(await adaptor.prepareCompleteSupply(CALLER_SECRET, { name: SUPPLY_NAME })).toEqual({
      ok: true,
      inputs: COMPLETE_INPUTS,
    })
  })

  const refusals: ReadonlyArray<[string, Error, SupplyResult | undefined]> = [
    [
      'a state conflict',
      new SupplyStateConflict(SUPPLY_NAME, 'AwaitingVaultRequest', 'complete'),
      {
        ok: false,
        error: `${SUPPLY_NAME} is AwaitingVaultRequest, which does not allow complete`,
      },
    ],
    [
      'bound bytes that are not the expected vault call',
      new SponsoredCallMismatch('startSupply'),
      {
        ok: false,
        error:
          'the bound bytes must be exactly one startSupply call to the vault, spending shielded coins alone',
      },
    ],
    ['any other error', new Error('indexer down'), undefined],
  ]

  test.each(refusals)('%s from a user action', async (_name, error, expectRefusal) => {
    const refusing = async () => {
      throw error
    }
    const adaptor = adaptorOver({
      startSupply: refusing,
      prepareCompleteSupply: refusing,
      completeSupply: refusing,
    })
    const starting = adaptor.startSupply(CALLER_SECRET, {
      supplyRequest: REQUEST,
      inIndex: 42n,
      boundTx: BOUND_TX,
    })
    const preparing = adaptor.prepareCompleteSupply(CALLER_SECRET, { name: SUPPLY_NAME })
    const completing = adaptor.completeSupply(CALLER_SECRET, {
      name: SUPPLY_NAME,
      boundTx: BOUND_TX,
    })
    for (const outcome of [starting, preparing, completing]) {
      if (expectRefusal === undefined) await expect(outcome).rejects.toThrow(error.message)
      else expect(await outcome).toEqual(expectRefusal)
    }
  })
})
