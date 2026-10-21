import { describe, expect, test } from 'vitest'

import type { CallerCallStage } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import {
  completeDepositInBrowser,
  type DepositActions,
  startDepositInBrowser,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/browser-deposit-calls'
import type {
  DepositCompleteInputs,
  DepositStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { DepositCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-call-builder'
import {
  DEPOSIT_NAME,
  depositFixture,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import type {
  CompleteDepositArgs,
  PrepareCompleteDepositArgs,
  PrepareStartDepositArgs,
  StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import type {
  DepositResult,
  DepositStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import type {
  CompleteDepositCircuitArgs,
  StartDepositCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const CALLER_SECRET = 'ab'.repeat(32)
const SECRET_KEY = new Uint8Array(32).fill(0xab)
const PUBLIC_KEYS = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const DEPOSIT_REQUEST = { erc20Address: ERC20_ADDRESS, amount: 1_000_000n }
const deposit = depositFixture()
const START_INPUTS: DepositStartInputs = {
  inIndex: 42n,
  evmNonce: 7n,
  gasLimit: 100_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
}
const COMPLETE_INPUTS: DepositCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: ATTESTATION_FIELDS.attestationOutputKind,
  attestationOutput: ATTESTATION_FIELDS.attestationOutput,
}
const NONCE_CONFLICT_ERROR = 'the next nonce moved: prepare and build it again'
const NONCE_CONFLICT: DepositResult = {
  ok: false,
  error: NONCE_CONFLICT_ERROR,
  reason: 'nonceConflict',
}
const STATE_CONFLICT_ERROR = 'the deposit is not awaiting that'
const STATE_CONFLICT: DepositResult = { ok: false, error: STATE_CONFLICT_ERROR }

/**
 * Every collaborator call and every stage reported, in the order they happened, with the
 * arguments each call received.
 */
interface Trail {
  readonly events: string[]
  readonly received: Received
}

interface Received {
  readonly prepareStartDeposit: PrepareStartDepositArgs[]
  readonly startDeposit: StartDepositArgs[]
  readonly prepareCompleteDeposit: PrepareCompleteDepositArgs[]
  readonly completeDeposit: CompleteDepositArgs[]
  readonly buildStart: StartDepositCircuitArgs[]
  readonly buildComplete: CompleteDepositCircuitArgs[]
  readonly finalize: string[]
}

const NOTHING_RECEIVED: Received = {
  prepareStartDeposit: [],
  startDeposit: [],
  prepareCompleteDeposit: [],
  completeDeposit: [],
  buildStart: [],
  buildComplete: [],
  finalize: [],
}

interface Doubles {
  /** The answers of `startDeposit`, one per call, the last repeated. */
  readonly started?: readonly DepositResult[]
  readonly completed?: DepositResult
  readonly prepareStartRefusal?: DepositStartInputsResult
  readonly buildFailure?: Error
}

function collaborators(doubles: Doubles) {
  const trail: Trail = { events: [], received: structuredClone(NOTHING_RECEIVED) }
  let starts = 0
  const actions = mock<DepositActions>('DepositActions', {
    prepareStartDeposit: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('prepareStartDeposit')
      trail.received.prepareStartDeposit.push(args)
      return doubles.prepareStartRefusal ?? { ok: true, inputs: START_INPUTS }
    },
    startDeposit: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('startDeposit')
      trail.received.startDeposit.push(args)
      const answers = doubles.started ?? [{ ok: true, deposit }]
      const answer = answers[Math.min(starts, answers.length - 1)]
      starts += 1
      if (answer === undefined) throw new Error('the case scripts no startDeposit answer')
      return answer
    },
    prepareCompleteDeposit: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('prepareCompleteDeposit')
      trail.received.prepareCompleteDeposit.push(args)
      return { ok: true, inputs: COMPLETE_INPUTS }
    },
    completeDeposit: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('completeDeposit')
      trail.received.completeDeposit.push(args)
      return doubles.completed ?? { ok: true, deposit }
    },
  })
  const builder = mock<DepositCallBuilder>('DepositCallBuilder', {
    buildStart: async (args: StartDepositCircuitArgs) => {
      trail.events.push('buildStart')
      trail.received.buildStart.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-start'
    },
    buildComplete: async (args: CompleteDepositCircuitArgs) => {
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
  'prepareStartDeposit',
  'stage:building',
  'buildStart',
  'stage:signing',
  'finalize',
  'stage:recording',
  'startDeposit',
]

describe('startDepositInBrowser', () => {
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
      name: 'a nonce conflict releases the finalised bytes, then is prepared and built once more',
      doubles: { started: [NONCE_CONFLICT, { ok: true, deposit }] },
      expectEvents: [...START_PASS, 'release(finalized(unbound-start))', ...START_PASS],
    },
    {
      name: 'a second nonce conflict surfaces',
      doubles: { started: [NONCE_CONFLICT, NONCE_CONFLICT] },
      expectEvents: [
        ...START_PASS,
        'release(finalized(unbound-start))',
        ...START_PASS,
        'release(finalized(unbound-start))',
      ],
      expectError: NONCE_CONFLICT_ERROR,
    },
    {
      name: 'any other refusal of the record surfaces without a retry',
      doubles: { started: [STATE_CONFLICT, { ok: true, deposit }] },
      expectEvents: [...START_PASS, 'release(finalized(unbound-start))'],
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a refused prepare surfaces before anything is built',
      doubles: { prepareStartRefusal: { ok: false, error: 'depositRequest.amount' } },
      expectEvents: ['stage:preparing', 'prepareStartDeposit'],
      expectError: 'depositRequest.amount',
    },
    {
      name: 'a contract assert while building is the vault refusing the deposit',
      doubles: { buildFailure: new Error('failed assert: token not allowed') },
      expectEvents: ['stage:preparing', 'prepareStartDeposit', 'stage:building', 'buildStart'],
      expectError: 'the vault refused the deposit: token not allowed',
    },
    {
      name: 'any other builder rejection surfaces as it is',
      doubles: { buildFailure: new Error('proof server unreachable') },
      expectEvents: ['stage:preparing', 'prepareStartDeposit', 'stage:building', 'buildStart'],
      expectError: 'proof server unreachable',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const starting = startDepositInBrowser({ ...args, depositRequest: DEPOSIT_REQUEST })
    if (expectError === undefined) expect(await starting).toBe(deposit)
    else await expect(starting).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  test('each call receives the request, the keys, the assignment and the finalised bytes', async () => {
    const { trail, args } = collaborators({})
    await startDepositInBrowser({ ...args, depositRequest: DEPOSIT_REQUEST })
    expect(trail.received).toEqual({
      ...NOTHING_RECEIVED,
      prepareStartDeposit: [{ depositRequest: DEPOSIT_REQUEST, wallet: PUBLIC_KEYS }],
      buildStart: [
        {
          secretKey: SECRET_KEY,
          wallet: PUBLIC_KEYS,
          inIndex: START_INPUTS.inIndex,
          evmNonce: START_INPUTS.evmNonce,
          gas: {
            gasLimit: START_INPUTS.gasLimit,
            maxFeePerGas: START_INPUTS.maxFeePerGas,
            maxPriorityFeePerGas: START_INPUTS.maxPriorityFeePerGas,
          },
          erc20Address: DEPOSIT_REQUEST.erc20Address,
          amount: DEPOSIT_REQUEST.amount,
        },
      ],
      finalize: ['unbound-start'],
      startDeposit: [
        {
          depositRequest: DEPOSIT_REQUEST,
          wallet: PUBLIC_KEYS,
          inIndex: START_INPUTS.inIndex,
          evmNonce: START_INPUTS.evmNonce,
          finalizedTx: 'finalized(unbound-start)',
        },
      ],
    })
  })

  test('no error carries the caller secret', async () => {
    const { args } = collaborators({ started: [STATE_CONFLICT] })
    const error: unknown = await startDepositInBrowser({
      ...args,
      depositRequest: DEPOSIT_REQUEST,
    }).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain(CALLER_SECRET)
  })
})

const COMPLETE_PASS = [
  'stage:preparing',
  'prepareCompleteDeposit',
  'stage:building',
  'buildComplete',
  'stage:signing',
  'finalize',
  'stage:recording',
  'completeDeposit',
]

describe('completeDepositInBrowser', () => {
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
      name: 'a nonce conflict reason is not retried for a completion',
      doubles: { completed: NONCE_CONFLICT },
      expectEvents: [...COMPLETE_PASS, 'release(finalized(unbound-complete))'],
      expectError: NONCE_CONFLICT_ERROR,
    },
    {
      name: 'a refused record surfaces without a retry',
      doubles: { completed: STATE_CONFLICT },
      expectEvents: [...COMPLETE_PASS, 'release(finalized(unbound-complete))'],
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a contract assert while building is the vault refusing the deposit',
      doubles: { buildFailure: new Error('failed assert: request not attested') },
      expectEvents: COMPLETE_PASS.slice(0, 4),
      expectError: 'the vault refused the deposit: request not attested',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const completing = completeDepositInBrowser({ ...args, name: DEPOSIT_NAME })
    if (expectError === undefined) expect(await completing).toBe(deposit)
    else await expect(completing).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  test('each call receives the name, the keys, the attested inputs and the finalised bytes', async () => {
    const { trail, args } = collaborators({})
    await completeDepositInBrowser({ ...args, name: DEPOSIT_NAME })
    expect(trail.received).toEqual({
      ...NOTHING_RECEIVED,
      prepareCompleteDeposit: [{ name: DEPOSIT_NAME, wallet: PUBLIC_KEYS }],
      buildComplete: [
        {
          secretKey: SECRET_KEY,
          wallet: PUBLIC_KEYS,
          requestId: REQUEST_ID,
          serializedOutput: new Uint8Array([1]),
          mintNonce: expect.any(Uint8Array),
        },
      ],
      finalize: ['unbound-complete'],
      completeDeposit: [
        { name: DEPOSIT_NAME, wallet: PUBLIC_KEYS, finalizedTx: 'finalized(unbound-complete)' },
      ],
    })
  })

  test('every completion draws a fresh 32-byte mint nonce', async () => {
    const { trail, args } = collaborators({})
    await completeDepositInBrowser({ ...args, name: DEPOSIT_NAME })
    await completeDepositInBrowser({ ...args, name: DEPOSIT_NAME })
    const nonces = trail.received.buildComplete.map((built) => built.mintNonce)
    expect(nonces.map((nonce) => nonce.length)).toEqual([32, 32])
    expect(nonces[0]).not.toEqual(nonces[1])
  })
})
