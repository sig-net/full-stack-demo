import { hexToBytes } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import type { CallerCallStage } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import {
  completeSupplyInBrowser,
  startSupplyInBrowser,
  type SupplyActions,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/browser-supply-calls'
import type {
  SupplyCompleteInputs,
  SupplyStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { SupplyCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-call-builder'
import {
  SUPPLY_NAME,
  supplyFixture,
  UNDERLYING_ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-fixtures'
import type {
  CompleteSupplyArgs,
  PrepareCompleteSupplyArgs,
  PrepareStartSupplyArgs,
  StartSupplyArgs,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import type {
  SupplyCompleteInputsResult,
  SupplyResult,
  SupplyStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service-adaptor'
import type {
  CompleteSupplyCircuitArgs,
  StartSupplyCircuitArgs,
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
const SUPPLY_REQUEST = { amount: 1_000_000n }
const SHARES_OUTPUT = `40420f${'00'.repeat(29)}`
const supply = supplyFixture()
const START_INPUTS: SupplyStartInputs = {
  inIndex: 42n,
  underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
}
const EXECUTED_INPUTS: SupplyCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: 'executed',
  attestationOutput: SHARES_OUTPUT,
}
const STATE_CONFLICT_ERROR = 'the supply is not awaiting that'
const STATE_CONFLICT: SupplyResult = { ok: false, error: STATE_CONFLICT_ERROR }
const RECORD_REFUSAL: SupplyResult = { ok: false, error: 'the vault ledger could not be read' }

/** Every collaborator call and every stage reported, in order, with the arguments each call received. */
interface Trail {
  readonly events: string[]
  readonly received: Received
}

interface Received {
  readonly prepareStartSupply: PrepareStartSupplyArgs[]
  readonly startSupply: StartSupplyArgs[]
  readonly prepareCompleteSupply: PrepareCompleteSupplyArgs[]
  readonly completeSupply: CompleteSupplyArgs[]
  readonly buildStart: StartSupplyCircuitArgs[]
  readonly buildComplete: CompleteSupplyCircuitArgs[]
  readonly finalize: string[]
}

const NOTHING_RECEIVED: Received = {
  prepareStartSupply: [],
  startSupply: [],
  prepareCompleteSupply: [],
  completeSupply: [],
  buildStart: [],
  buildComplete: [],
  finalize: [],
}

interface Doubles {
  readonly started?: SupplyResult
  readonly completed?: SupplyResult
  readonly prepareStartRefusal?: SupplyStartInputsResult
  readonly prepareComplete?: SupplyCompleteInputsResult
  readonly buildFailure?: Error
}

function collaborators(doubles: Doubles) {
  const trail: Trail = { events: [], received: structuredClone(NOTHING_RECEIVED) }
  const actions = mock<SupplyActions>('SupplyActions', {
    prepareStartSupply: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('prepareStartSupply')
      trail.received.prepareStartSupply.push(args)
      return doubles.prepareStartRefusal ?? { ok: true, inputs: START_INPUTS }
    },
    startSupply: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('startSupply')
      trail.received.startSupply.push(args)
      return doubles.started ?? { ok: true, supply }
    },
    prepareCompleteSupply: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('prepareCompleteSupply')
      trail.received.prepareCompleteSupply.push(args)
      return doubles.prepareComplete ?? { ok: true, inputs: EXECUTED_INPUTS }
    },
    completeSupply: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('completeSupply')
      trail.received.completeSupply.push(args)
      return doubles.completed ?? { ok: true, supply }
    },
  })
  const builder = mock<SupplyCallBuilder>('SupplyCallBuilder', {
    buildStart: async (args: StartSupplyCircuitArgs) => {
      trail.events.push('buildStart')
      trail.received.buildStart.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-start'
    },
    buildComplete: async (args: CompleteSupplyCircuitArgs) => {
      trail.events.push('buildComplete')
      trail.received.buildComplete.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-complete'
    },
  })
  const wallet = mock<Wallet>('Wallet', {
    publicKeys: PUBLIC_KEYS,
    finalize: async (unboundTx) => {
      trail.events.push('finalize')
      trail.received.finalize.push(unboundTx)
      return `finalized(${unboundTx})`
    },
    release: async (finalizedTx) => {
      trail.events.push(`release(${finalizedTx})`)
    },
  })
  const onStage = (stage: CallerCallStage): void => {
    trail.events.push(`stage:${stage}`)
  }
  return { trail, args: { actions, builder, wallet, callerSecret: CALLER_SECRET, onStage } }
}

const START_PASS = [
  'stage:preparing',
  'prepareStartSupply',
  'stage:building',
  'buildStart',
  'stage:signing',
  'finalize',
  'stage:recording',
  'startSupply',
]

describe('startSupplyInBrowser', () => {
  const cases: ReadonlyArray<{
    name: string
    doubles: Doubles
    expectEvents: string[]
    expectError?: string
  }> = [
    {
      name: 'prepares, builds, finalises and records the start call once',
      doubles: {},
      expectEvents: START_PASS,
    },
    {
      name: 'a refused record surfaces without a retry',
      doubles: { started: RECORD_REFUSAL },
      expectEvents: [...START_PASS, 'release(finalized(unbound-start))'],
      expectError: 'the vault ledger could not be read',
    },
    {
      name: 'a refused prepare surfaces before anything is built',
      doubles: { prepareStartRefusal: { ok: false, error: 'supplyRequest.amount' } },
      expectEvents: ['stage:preparing', 'prepareStartSupply'],
      expectError: 'supplyRequest.amount',
    },
    {
      name: 'a contract assert while building is the vault refusing the supply',
      doubles: { buildFailure: new Error('failed assert: stata pair not set') },
      expectEvents: START_PASS.slice(0, 4),
      expectError: 'the vault refused the supply: stata pair not set',
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
    const starting = startSupplyInBrowser({ ...args, supplyRequest: SUPPLY_REQUEST })
    if (expectError === undefined) expect(await starting).toBe(supply)
    else await expect(starting).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  test('each call receives the request, the keys, the slot, the underlying and the finalised bytes', async () => {
    const { trail, args } = collaborators({})
    await startSupplyInBrowser({ ...args, supplyRequest: SUPPLY_REQUEST })
    expect(trail.received).toEqual({
      ...NOTHING_RECEIVED,
      prepareStartSupply: [{ supplyRequest: SUPPLY_REQUEST }],
      buildStart: [
        {
          secretKey: SECRET_KEY,
          wallet: PUBLIC_KEYS,
          inIndex: START_INPUTS.inIndex,
          underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
          amount: SUPPLY_REQUEST.amount,
        },
      ],
      finalize: ['unbound-start'],
      startSupply: [
        {
          supplyRequest: SUPPLY_REQUEST,
          inIndex: START_INPUTS.inIndex,
          finalizedTx: 'finalized(unbound-start)',
        },
      ],
    })
  })

  test('no error carries the caller secret', async () => {
    const { args } = collaborators({ started: STATE_CONFLICT })
    const error: unknown = await startSupplyInBrowser({
      ...args,
      supplyRequest: SUPPLY_REQUEST,
    }).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain(CALLER_SECRET)
  })
})

const COMPLETE_PASS = [
  'stage:preparing',
  'prepareCompleteSupply',
  'stage:building',
  'buildComplete',
  'stage:signing',
  'finalize',
  'stage:recording',
  'completeSupply',
]

describe('completeSupplyInBrowser', () => {
  const cases: ReadonlyArray<{
    name: string
    doubles: Doubles
    expectEvents: string[]
    expectError?: string
  }> = [
    {
      name: 'prepares, builds, finalises and records the complete call once',
      doubles: {},
      expectEvents: COMPLETE_PASS,
    },
    {
      name: 'a refused record surfaces without a retry',
      doubles: { completed: STATE_CONFLICT },
      expectEvents: [...COMPLETE_PASS, 'release(finalized(unbound-complete))'],
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a contract assert while building is the vault refusing the supply',
      doubles: { buildFailure: new Error('failed assert: request not attested') },
      expectEvents: COMPLETE_PASS.slice(0, 4),
      expectError: 'the vault refused the supply: request not attested',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const completing = completeSupplyInBrowser({ ...args, name: SUPPLY_NAME })
    if (expectError === undefined) expect(await completing).toBe(supply)
    else await expect(completing).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  const outputs: ReadonlyArray<{
    name: string
    inputs: SupplyCompleteInputs
    expectOutput: Uint8Array
  }> = [
    {
      name: 'the attested shares of an executed deposit',
      inputs: EXECUTED_INPUTS,
      expectOutput: hexToBytes(SHARES_OUTPUT),
    },
    {
      name: '32 zero bytes for a failed deposit, which the circuit ignores',
      inputs: { requestId: REQUEST_ID_HEX, attestationOutputKind: 'failed', attestationOutput: '' },
      expectOutput: new Uint8Array(32),
    },
  ]

  test.each(outputs)(
    'each call receives the name, the keys, $name and the finalised bytes',
    async ({ inputs, expectOutput }) => {
      const { trail, args } = collaborators({ prepareComplete: { ok: true, inputs } })
      await completeSupplyInBrowser({ ...args, name: SUPPLY_NAME })
      expect(trail.received).toEqual({
        ...NOTHING_RECEIVED,
        prepareCompleteSupply: [{ name: SUPPLY_NAME }],
        buildComplete: [
          {
            secretKey: SECRET_KEY,
            wallet: PUBLIC_KEYS,
            requestId: REQUEST_ID,
            serializedOutput: expectOutput,
            mintNonce: expect.any(Uint8Array),
          },
        ],
        finalize: ['unbound-complete'],
        completeSupply: [{ name: SUPPLY_NAME, finalizedTx: 'finalized(unbound-complete)' }],
      })
    },
  )

  test('every completion draws a fresh 32-byte mint nonce', async () => {
    const { trail, args } = collaborators({})
    await completeSupplyInBrowser({ ...args, name: SUPPLY_NAME })
    await completeSupplyInBrowser({ ...args, name: SUPPLY_NAME })
    const nonces = trail.received.buildComplete.map((built) => built.mintNonce)
    expect(nonces.map((nonce) => nonce.length)).toEqual([32, 32])
    expect(nonces[0]).not.toEqual(nonces[1])
  })
})
