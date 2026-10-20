import { hexToBytes } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import type { CallerCallStage } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/browser-caller-calls'
import {
  completeSwapInBrowser,
  startSwapInBrowser,
  type SwapActions,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/browser-swap-calls'
import type {
  SwapCompleteInputs,
  SwapStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { SwapCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-call-builder'
import {
  ERC20_ADDRESS_IN,
  ERC20_ADDRESS_OUT,
  SWAP_NAME,
  swapFixture,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-fixtures'
import type {
  CompleteSwapArgs,
  PrepareCompleteSwapArgs,
  PrepareStartSwapArgs,
  StartSwapArgs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service'
import type {
  SwapCompleteInputsResult,
  SwapResult,
  SwapStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service-adaptor'
import type {
  CompleteSwapCircuitArgs,
  StartSwapCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import {
  REQUEST_ID,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const CALLER_SECRET = 'ab'.repeat(32)
const SECRET_KEY = new Uint8Array(32).fill(0xab)
const PUBLIC_KEYS = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const SWAP_REQUEST = {
  erc20AddressIn: ERC20_ADDRESS_IN,
  erc20AddressOut: ERC20_ADDRESS_OUT,
  fee: 500n,
  amountOut: 1_000_000n,
  amountInMaximum: 1_100_000n,
}
const AMOUNT_IN_OUTPUT = `40420f${'00'.repeat(29)}`
const swap = swapFixture()
const START_INPUTS: SwapStartInputs = { inIndex: 42n }
const EXECUTED_INPUTS: SwapCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: 'executed',
  attestationOutput: AMOUNT_IN_OUTPUT,
}
const STATE_CONFLICT_ERROR = 'the swap is not awaiting that'
const STATE_CONFLICT: SwapResult = { ok: false, error: STATE_CONFLICT_ERROR }
const CALL_MISMATCH: SwapResult = {
  ok: false,
  error: 'the bound bytes must be exactly one startSwap call to the vault',
}

/** Every collaborator call and every stage reported, in order, with the arguments each call received. */
interface Trail {
  readonly events: string[]
  readonly received: Received
}

interface Received {
  readonly prepareStartSwap: PrepareStartSwapArgs[]
  readonly startSwap: StartSwapArgs[]
  readonly prepareCompleteSwap: PrepareCompleteSwapArgs[]
  readonly completeSwap: CompleteSwapArgs[]
  readonly buildStart: StartSwapCircuitArgs[]
  readonly buildComplete: CompleteSwapCircuitArgs[]
  readonly balanceWithoutFee: string[]
}

const NOTHING_RECEIVED: Received = {
  prepareStartSwap: [],
  startSwap: [],
  prepareCompleteSwap: [],
  completeSwap: [],
  buildStart: [],
  buildComplete: [],
  balanceWithoutFee: [],
}

interface Doubles {
  readonly started?: SwapResult
  readonly completed?: SwapResult
  readonly prepareStartRefusal?: SwapStartInputsResult
  readonly prepareComplete?: SwapCompleteInputsResult
  readonly buildFailure?: Error
}

function collaborators(doubles: Doubles) {
  const trail: Trail = { events: [], received: structuredClone(NOTHING_RECEIVED) }
  const actions = mock<SwapActions>('SwapActions', {
    prepareStartSwap: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('prepareStartSwap')
      trail.received.prepareStartSwap.push(args)
      return doubles.prepareStartRefusal ?? { ok: true, inputs: START_INPUTS }
    },
    startSwap: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('startSwap')
      trail.received.startSwap.push(args)
      return doubles.started ?? { ok: true, swap }
    },
    prepareCompleteSwap: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('prepareCompleteSwap')
      trail.received.prepareCompleteSwap.push(args)
      return doubles.prepareComplete ?? { ok: true, inputs: EXECUTED_INPUTS }
    },
    completeSwap: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('completeSwap')
      trail.received.completeSwap.push(args)
      return doubles.completed ?? { ok: true, swap }
    },
  })
  const builder = mock<SwapCallBuilder>('SwapCallBuilder', {
    buildStart: async (args: StartSwapCircuitArgs) => {
      trail.events.push('buildStart')
      trail.received.buildStart.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-start'
    },
    buildComplete: async (args: CompleteSwapCircuitArgs) => {
      trail.events.push('buildComplete')
      trail.received.buildComplete.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-complete'
    },
  })
  const wallet = mock<Wallet>('Wallet', {
    publicKeys: PUBLIC_KEYS,
    balanceWithoutFee: async (unboundTx) => {
      trail.events.push('balanceWithoutFee')
      trail.received.balanceWithoutFee.push(unboundTx)
      return `bound(${unboundTx})`
    },
  })
  const onStage = (stage: CallerCallStage): void => {
    trail.events.push(`stage:${stage}`)
  }
  return { trail, args: { actions, builder, wallet, callerSecret: CALLER_SECRET, onStage } }
}

const START_PASS = [
  'stage:preparing',
  'prepareStartSwap',
  'stage:building',
  'buildStart',
  'stage:signing',
  'balanceWithoutFee',
  'stage:recording',
  'startSwap',
]

describe('startSwapInBrowser', () => {
  const cases: ReadonlyArray<{
    name: string
    doubles: Doubles
    expectEvents: string[]
    expectError?: string
  }> = [
    {
      name: 'prepares, builds, binds and records the start call once',
      doubles: {},
      expectEvents: START_PASS,
    },
    {
      name: 'a refused record surfaces without a retry',
      doubles: { started: CALL_MISMATCH },
      expectEvents: START_PASS,
      expectError: 'the bound bytes must be exactly one startSwap call to the vault',
    },
    {
      name: 'a refused prepare surfaces before anything is built',
      doubles: { prepareStartRefusal: { ok: false, error: 'swapRequest.amountOut' } },
      expectEvents: ['stage:preparing', 'prepareStartSwap'],
      expectError: 'swapRequest.amountOut',
    },
    {
      name: 'a contract assert while building is the vault refusing the swap',
      doubles: { buildFailure: new Error('failed assert: erc20AddressOut not allowed') },
      expectEvents: START_PASS.slice(0, 4),
      expectError: 'the vault refused the swap: erc20AddressOut not allowed',
    },
    {
      name: 'any other builder rejection surfaces as it is',
      doubles: { buildFailure: new Error('proof server unreachable') },
      expectEvents: START_PASS.slice(0, 4),
      expectError: 'proof server unreachable',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const starting = startSwapInBrowser({ ...args, swapRequest: SWAP_REQUEST })
    if (expectError === undefined) expect(await starting).toBe(swap)
    else await expect(starting).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  test('each call receives the request, the keys, the slot and the bound bytes', async () => {
    const { trail, args } = collaborators({})
    await startSwapInBrowser({ ...args, swapRequest: SWAP_REQUEST })
    expect(trail.received).toEqual({
      ...NOTHING_RECEIVED,
      prepareStartSwap: [{ swapRequest: SWAP_REQUEST }],
      buildStart: [
        {
          secretKey: SECRET_KEY,
          wallet: PUBLIC_KEYS,
          inIndex: START_INPUTS.inIndex,
          ...SWAP_REQUEST,
        },
      ],
      balanceWithoutFee: ['unbound-start'],
      startSwap: [
        {
          swapRequest: SWAP_REQUEST,
          inIndex: START_INPUTS.inIndex,
          boundTx: 'bound(unbound-start)',
        },
      ],
    })
  })

  test('no error carries the caller secret', async () => {
    const { args } = collaborators({ started: STATE_CONFLICT })
    const error: unknown = await startSwapInBrowser({
      ...args,
      swapRequest: SWAP_REQUEST,
    }).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain(CALLER_SECRET)
  })
})

const COMPLETE_PASS = [
  'stage:preparing',
  'prepareCompleteSwap',
  'stage:building',
  'buildComplete',
  'stage:signing',
  'balanceWithoutFee',
  'stage:recording',
  'completeSwap',
]

describe('completeSwapInBrowser', () => {
  const cases: ReadonlyArray<{
    name: string
    doubles: Doubles
    expectEvents: string[]
    expectError?: string
  }> = [
    {
      name: 'prepares, builds, binds and records the complete call once',
      doubles: {},
      expectEvents: COMPLETE_PASS,
    },
    {
      name: 'a refused prepare surfaces before anything is built',
      doubles: { prepareComplete: STATE_CONFLICT },
      expectEvents: COMPLETE_PASS.slice(0, 2),
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a refused record surfaces without a retry',
      doubles: { completed: STATE_CONFLICT },
      expectEvents: COMPLETE_PASS,
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a contract assert while building is the vault refusing the swap',
      doubles: { buildFailure: new Error('failed assert: request not attested') },
      expectEvents: COMPLETE_PASS.slice(0, 4),
      expectError: 'the vault refused the swap: request not attested',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const completing = completeSwapInBrowser({ ...args, name: SWAP_NAME })
    if (expectError === undefined) expect(await completing).toBe(swap)
    else await expect(completing).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  const outputs: ReadonlyArray<{
    name: string
    inputs: SwapCompleteInputs
    expectOutput: Uint8Array
  }> = [
    {
      name: 'the attested amount spent by an executed trade',
      inputs: EXECUTED_INPUTS,
      expectOutput: hexToBytes(AMOUNT_IN_OUTPUT),
    },
    {
      name: '32 zero bytes for a failed trade, which the circuit ignores',
      inputs: { requestId: REQUEST_ID_HEX, attestationOutputKind: 'failed', attestationOutput: '' },
      expectOutput: new Uint8Array(32),
    },
  ]

  test.each(outputs)(
    'each call receives the name, the keys, $name and the bound bytes',
    async ({ inputs, expectOutput }) => {
      const { trail, args } = collaborators({ prepareComplete: { ok: true, inputs } })
      await completeSwapInBrowser({ ...args, name: SWAP_NAME })
      expect(trail.received).toEqual({
        ...NOTHING_RECEIVED,
        prepareCompleteSwap: [{ name: SWAP_NAME }],
        buildComplete: [
          {
            secretKey: SECRET_KEY,
            wallet: PUBLIC_KEYS,
            requestId: REQUEST_ID,
            serializedOutput: expectOutput,
            mintNonce: expect.any(Uint8Array),
            changeNonce: expect.any(Uint8Array),
          },
        ],
        balanceWithoutFee: ['unbound-complete'],
        completeSwap: [{ name: SWAP_NAME, boundTx: 'bound(unbound-complete)' }],
      })
    },
  )

  test('every completion draws a fresh 32-byte mint nonce and a change nonce different from it', async () => {
    const { trail, args } = collaborators({})
    await completeSwapInBrowser({ ...args, name: SWAP_NAME })
    await completeSwapInBrowser({ ...args, name: SWAP_NAME })
    const nonces = trail.received.buildComplete.flatMap((built) => [
      built.mintNonce,
      built.changeNonce,
    ])
    expect(nonces.map((nonce) => nonce.length)).toEqual([32, 32, 32, 32])
    expect(new Set(nonces.map((nonce) => nonce.toString())).size).toBe(4)
  })
})
