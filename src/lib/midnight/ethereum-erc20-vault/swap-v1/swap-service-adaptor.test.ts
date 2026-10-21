import { describe, expect, test } from 'vitest'

import type {
  SwapCompleteInputs,
  SwapStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import {
  ERC20_ADDRESS_IN,
  ERC20_ADDRESS_OUT,
  SWAP_NAME,
  swapFixture,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-fixtures'
import type { SwapQuote } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-quote'
import type { SwapService } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service'
import {
  type SwapResult,
  SwapServiceAdaptor,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service-adaptor'
import { SwapStateConflict } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-controller'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const CALLER_SECRET = 'ab'.repeat(32)
const swap = swapFixture()
const quote: SwapQuote = {
  erc20AddressIn: ERC20_ADDRESS_IN,
  erc20AddressOut: ERC20_ADDRESS_OUT,
  amountIn: 1_000_000n,
  fee: 500n,
  amountOut: 990_000n,
  slippageBps: 100n,
  amountOutMinimum: 980_100n,
}
const REQUEST = {
  erc20AddressIn: ERC20_ADDRESS_IN,
  erc20AddressOut: ERC20_ADDRESS_OUT,
  fee: 500n,
  amountOut: 980_100n,
  amountInMaximum: 1_000_000n,
}
const WIRE_REQUEST = { ...REQUEST, fee: '500', amountOut: '980100', amountInMaximum: '1000000' }
const FINALIZED_TX = `0x${'F1A1'.repeat(2)}`
const PARSED_FINALIZED_TX = 'f1a1'.repeat(2)
const START_INPUTS: SwapStartInputs = { inIndex: 42n }
const COMPLETE_INPUTS: SwapCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: ATTESTATION_FIELDS.attestationOutputKind,
  attestationOutput: ATTESTATION_FIELDS.attestationOutput,
}

function adaptorOver(service: Partial<SwapService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new SwapServiceAdaptor(
    mock<SwapService>('SwapService', {
      quoteSwap: recording(quote),
      prepareStartSwap: recording(START_INPUTS),
      startSwap: recording(swap),
      prepareCompleteSwap: recording(COMPLETE_INPUTS),
      completeSwap: recording(swap),
      getSwap: recording(swap),
      listSwaps: recording([swap]),
      ...service,
    }),
    new RecordingLogger(),
  )
}

describe('SwapServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: SwapServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'quoteSwap carries the amount as a bigint and takes the default slippage',
      call: (a) =>
        a.quoteSwap(CALLER_SECRET, {
          erc20AddressIn: ERC20_ADDRESS_IN,
          erc20AddressOut: ERC20_ADDRESS_OUT,
          amountIn: '1000000',
        }),
      expectReceived: [
        {
          erc20AddressIn: ERC20_ADDRESS_IN,
          erc20AddressOut: ERC20_ADDRESS_OUT,
          amountIn: 1_000_000n,
          slippageBps: 1_000n,
        },
      ],
    },
    {
      name: 'quoteSwap refuses a slippage past half the output',
      call: (a) =>
        a.quoteSwap(CALLER_SECRET, {
          erc20AddressIn: ERC20_ADDRESS_IN,
          erc20AddressOut: ERC20_ADDRESS_OUT,
          amountIn: '1000000',
          slippageBps: '5001',
        }),
      expectReceived: [],
      expectError: 'slippageBps',
    },
    {
      name: 'quoteSwap refuses a zero amount',
      call: (a) =>
        a.quoteSwap(CALLER_SECRET, {
          erc20AddressIn: ERC20_ADDRESS_IN,
          erc20AddressOut: ERC20_ADDRESS_OUT,
          amountIn: 0n,
        }),
      expectReceived: [],
      expectError: 'amountIn',
    },
    {
      name: 'prepareStartSwap carries the request with its amounts as bigints',
      call: (a) => a.prepareStartSwap(CALLER_SECRET, { swapRequest: WIRE_REQUEST }),
      expectReceived: [{ swapRequest: REQUEST }],
    },
    {
      name: 'prepareStartSwap refuses a request without a fee tier',
      call: (a) =>
        a.prepareStartSwap(CALLER_SECRET, { swapRequest: { ...REQUEST, fee: undefined } }),
      expectReceived: [],
      expectError: 'swapRequest.fee',
    },
    {
      name: 'startSwap carries the request, the slot and the finalised bytes normalised',
      call: (a) =>
        a.startSwap(CALLER_SECRET, {
          swapRequest: WIRE_REQUEST,
          inIndex: '42',
          finalizedTx: FINALIZED_TX,
        }),
      expectReceived: [{ swapRequest: REQUEST, inIndex: 42n, finalizedTx: PARSED_FINALIZED_TX }],
    },
    {
      name: 'startSwap refuses a request without a fee tier',
      call: (a) =>
        a.startSwap(CALLER_SECRET, {
          swapRequest: { ...REQUEST, fee: undefined },
          inIndex: 42n,
          finalizedTx: FINALIZED_TX,
        }),
      expectReceived: [],
      expectError: 'swapRequest.fee',
    },
    {
      name: 'startSwap refuses finalised bytes that are not hex',
      call: (a) =>
        a.startSwap(CALLER_SECRET, { swapRequest: REQUEST, inIndex: 42n, finalizedTx: 'zz' }),
      expectReceived: [],
      expectError: 'finalizedTx',
    },
    {
      name: 'startSwap refuses a missing slot',
      call: (a) => a.startSwap(CALLER_SECRET, { swapRequest: REQUEST, finalizedTx: FINALIZED_TX }),
      expectReceived: [],
      expectError: 'inIndex',
    },
    {
      name: 'prepareCompleteSwap passes the name',
      call: (a) => a.prepareCompleteSwap(CALLER_SECRET, { name: SWAP_NAME }),
      expectReceived: [{ name: SWAP_NAME }],
    },
    {
      name: 'completeSwap passes the name and the finalised bytes',
      call: (a) => a.completeSwap(CALLER_SECRET, { name: SWAP_NAME, finalizedTx: FINALIZED_TX }),
      expectReceived: [{ name: SWAP_NAME, finalizedTx: PARSED_FINALIZED_TX }],
    },
    {
      name: 'completeSwap refuses a name that is not a swap',
      call: (a) => a.completeSwap(CALLER_SECRET, { name: 'swaps/1', finalizedTx: FINALIZED_TX }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-swaps/{uuid}',
    },
    {
      name: 'getSwap passes the name',
      call: (a) => a.getSwap(CALLER_SECRET, { name: SWAP_NAME }),
      expectReceived: [{ name: SWAP_NAME }],
    },
    {
      name: 'listSwaps takes no arguments',
      call: (a) => a.listSwaps(CALLER_SECRET, {}),
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

describe('SwapServiceAdaptor outcomes', () => {
  test('a pair no pool prices is a result, not a failure', async () => {
    const adaptor = adaptorOver({ quoteSwap: async () => undefined })
    expect(
      await adaptor.quoteSwap(CALLER_SECRET, {
        erc20AddressIn: ERC20_ADDRESS_IN,
        erc20AddressOut: ERC20_ADDRESS_OUT,
        amountIn: 1n,
      }),
    ).toEqual({ ok: false, error: 'No Uniswap pool prices this pair.' })
  })

  test('a missing swap is a not-found result', async () => {
    const adaptor = adaptorOver({ getSwap: async () => undefined })
    expect(await adaptor.getSwap(CALLER_SECRET, { name: SWAP_NAME })).toEqual({
      ok: false,
      error: `${SWAP_NAME} was not found.`,
    })
  })

  test('the prepare methods answer with the inputs the service assigned or read', async () => {
    const adaptor = adaptorOver({})
    expect(await adaptor.prepareStartSwap(CALLER_SECRET, { swapRequest: REQUEST })).toEqual({
      ok: true,
      inputs: START_INPUTS,
    })
    expect(await adaptor.prepareCompleteSwap(CALLER_SECRET, { name: SWAP_NAME })).toEqual({
      ok: true,
      inputs: COMPLETE_INPUTS,
    })
  })

  const refusals: ReadonlyArray<[string, Error, SwapResult | undefined]> = [
    [
      'a state conflict',
      new SwapStateConflict(SWAP_NAME, 'AwaitingVaultRequest', 'complete'),
      {
        ok: false,
        error: `${SWAP_NAME} is AwaitingVaultRequest, which does not allow complete`,
      },
    ],
    ['any other error', new Error('indexer down'), undefined],
  ]

  test.each(refusals)('%s from a user action', async (_name, error, expectRefusal) => {
    const refusing = async () => {
      throw error
    }
    const adaptor = adaptorOver({
      startSwap: refusing,
      prepareCompleteSwap: refusing,
      completeSwap: refusing,
    })
    const starting = adaptor.startSwap(CALLER_SECRET, {
      swapRequest: REQUEST,
      inIndex: 42n,
      finalizedTx: FINALIZED_TX,
    })
    const preparing = adaptor.prepareCompleteSwap(CALLER_SECRET, { name: SWAP_NAME })
    const completing = adaptor.completeSwap(CALLER_SECRET, {
      name: SWAP_NAME,
      finalizedTx: FINALIZED_TX,
    })
    for (const outcome of [starting, preparing, completing]) {
      if (expectRefusal === undefined) await expect(outcome).rejects.toThrow(error.message)
      else expect(await outcome).toEqual(expectRefusal)
    }
  })
})
