import { describe, expect, test } from 'vitest'

import {
  ERC20_ADDRESS_IN,
  ERC20_ADDRESS_OUT,
  SWAP_NAME,
  swapFixture,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-fixtures'
import type { SwapQuote } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-quote'
import type { SwapService } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service'
import { SwapServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service-adaptor'
import { SwapStateConflict } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-controller'
import { mock } from '@/lib/testing/mock'

const CALLER_SECRET = 'ab'.repeat(32)
const WALLET = { coinPublicKey: `0x${'AA'.repeat(32)}`, encryptionPublicKey: 'bb'.repeat(32) }
const PARSED_WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
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
      startSwap: recording(swap),
      completeSwap: recording(swap),
      getSwap: recording(swap),
      listSwaps: recording([swap]),
      ...service,
    }),
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
      name: 'startSwap normalises the wallet keys and carries the request',
      call: (a) => a.startSwap(CALLER_SECRET, { swapRequest: REQUEST, wallet: WALLET }),
      expectReceived: [{ swapRequest: REQUEST, wallet: PARSED_WALLET }],
    },
    {
      name: 'startSwap refuses a request without a fee tier',
      call: (a) =>
        a.startSwap(CALLER_SECRET, {
          swapRequest: { ...REQUEST, fee: undefined },
          wallet: WALLET,
        }),
      expectReceived: [],
      expectError: 'swapRequest.fee',
    },
    {
      name: 'completeSwap passes the name and the wallet',
      call: (a) => a.completeSwap(CALLER_SECRET, { name: SWAP_NAME, wallet: WALLET }),
      expectReceived: [{ name: SWAP_NAME, wallet: PARSED_WALLET }],
    },
    {
      name: 'completeSwap refuses a name that is not a swap',
      call: (a) => a.completeSwap(CALLER_SECRET, { name: 'swaps/1', wallet: WALLET }),
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

  test('a state conflict is a result the caller can act on', async () => {
    const adaptor = adaptorOver({
      completeSwap: async () => {
        throw new SwapStateConflict(SWAP_NAME, 'AwaitingVaultRequest', 'complete')
      },
    })
    expect(await adaptor.completeSwap(CALLER_SECRET, { name: SWAP_NAME, wallet: WALLET })).toEqual({
      ok: false,
      error: `${SWAP_NAME} is AwaitingVaultRequest, which does not allow complete`,
    })
  })

  test("a contract assert at build time is the vault's refusal", async () => {
    const adaptor = adaptorOver({
      startSwap: async () => {
        throw new Error('failed assert: erc20AddressOut not allowed')
      },
    })
    expect(
      await adaptor.startSwap(CALLER_SECRET, { swapRequest: REQUEST, wallet: WALLET }),
    ).toEqual({ ok: false, error: 'erc20AddressOut not allowed' })
  })

  test('any other failure propagates', async () => {
    const adaptor = adaptorOver({
      startSwap: async () => {
        throw new Error('indexer down')
      },
    })
    await expect(
      adaptor.startSwap(CALLER_SECRET, { swapRequest: REQUEST, wallet: WALLET }),
    ).rejects.toThrow('indexer down')
  })
})
