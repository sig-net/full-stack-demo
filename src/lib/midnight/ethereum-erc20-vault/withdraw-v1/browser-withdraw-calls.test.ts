import { describe, expect, test } from 'vitest'

import type { CallerCallStage } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import type {
  CompleteWithdrawCircuitArgs,
  StartWithdrawCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type {
  WithdrawCompleteInputs,
  WithdrawStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import {
  completeWithdrawInBrowser,
  startWithdrawInBrowser,
  type WithdrawActions,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/browser-withdraw-calls'
import type { WithdrawCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-call-builder'
import {
  DESTINATION,
  ERC20_ADDRESS,
  WITHDRAW_NAME,
  withdrawFixture,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-fixtures'
import type {
  CompleteWithdrawArgs,
  PrepareCompleteWithdrawArgs,
  PrepareStartWithdrawArgs,
  StartWithdrawArgs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import type {
  WithdrawResult,
  WithdrawStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-adaptor'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const CALLER_SECRET = 'ab'.repeat(32)
const SECRET_KEY = new Uint8Array(32).fill(0xab)
const PUBLIC_KEYS = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const WITHDRAW_REQUEST = {
  erc20Address: ERC20_ADDRESS,
  amount: 1_000_000n,
  destEvmAddress: DESTINATION,
}
const withdraw = withdrawFixture()
const START_INPUTS: WithdrawStartInputs = { inIndex: 42n }
const COMPLETE_INPUTS: WithdrawCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: ATTESTATION_FIELDS.attestationOutputKind,
  attestationOutput: ATTESTATION_FIELDS.attestationOutput,
}
const STATE_CONFLICT_ERROR = 'the withdrawal is not awaiting that'
const STATE_CONFLICT: WithdrawResult = { ok: false, error: STATE_CONFLICT_ERROR }
const RECORD_REFUSAL: WithdrawResult = { ok: false, error: 'the vault ledger could not be read' }

/** Every collaborator call and every stage reported, in order, with the arguments each call received. */
interface Trail {
  readonly events: string[]
  readonly received: Received
}

interface Received {
  readonly prepareStartWithdraw: PrepareStartWithdrawArgs[]
  readonly startWithdraw: StartWithdrawArgs[]
  readonly prepareCompleteWithdraw: PrepareCompleteWithdrawArgs[]
  readonly completeWithdraw: CompleteWithdrawArgs[]
  readonly buildStart: StartWithdrawCircuitArgs[]
  readonly buildComplete: CompleteWithdrawCircuitArgs[]
  readonly finalize: string[]
}

const NOTHING_RECEIVED: Received = {
  prepareStartWithdraw: [],
  startWithdraw: [],
  prepareCompleteWithdraw: [],
  completeWithdraw: [],
  buildStart: [],
  buildComplete: [],
  finalize: [],
}

interface Doubles {
  readonly started?: WithdrawResult
  readonly completed?: WithdrawResult
  readonly prepareStartRefusal?: WithdrawStartInputsResult
  readonly buildFailure?: Error
}

function collaborators(doubles: Doubles) {
  const trail: Trail = { events: [], received: structuredClone(NOTHING_RECEIVED) }
  const actions = mock<WithdrawActions>('WithdrawActions', {
    prepareStartWithdraw: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('prepareStartWithdraw')
      trail.received.prepareStartWithdraw.push(args)
      return doubles.prepareStartRefusal ?? { ok: true, inputs: START_INPUTS }
    },
    startWithdraw: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('startWithdraw')
      trail.received.startWithdraw.push(args)
      return doubles.started ?? { ok: true, withdraw }
    },
    prepareCompleteWithdraw: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('prepareCompleteWithdraw')
      trail.received.prepareCompleteWithdraw.push(args)
      return { ok: true, inputs: COMPLETE_INPUTS }
    },
    completeWithdraw: async (secret, args) => {
      expect(secret).toBe(CALLER_SECRET)
      trail.events.push('completeWithdraw')
      trail.received.completeWithdraw.push(args)
      return doubles.completed ?? { ok: true, withdraw }
    },
  })
  const builder = mock<WithdrawCallBuilder>('WithdrawCallBuilder', {
    buildStart: async (args: StartWithdrawCircuitArgs) => {
      trail.events.push('buildStart')
      trail.received.buildStart.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-start'
    },
    buildComplete: async (args: CompleteWithdrawCircuitArgs) => {
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
  'prepareStartWithdraw',
  'stage:building',
  'buildStart',
  'stage:signing',
  'finalize',
  'stage:recording',
  'startWithdraw',
]

describe('startWithdrawInBrowser', () => {
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
      doubles: { prepareStartRefusal: { ok: false, error: 'withdrawRequest.amount' } },
      expectEvents: ['stage:preparing', 'prepareStartWithdraw'],
      expectError: 'withdrawRequest.amount',
    },
    {
      name: 'a contract assert while building is the vault refusing the send',
      doubles: { buildFailure: new Error('failed assert: token not allowed') },
      expectEvents: ['stage:preparing', 'prepareStartWithdraw', 'stage:building', 'buildStart'],
      expectError: 'the vault refused the send: token not allowed',
    },
    {
      name: 'any other builder rejection surfaces as it is',
      doubles: { buildFailure: new Error('proof server unreachable') },
      expectEvents: ['stage:preparing', 'prepareStartWithdraw', 'stage:building', 'buildStart'],
      expectError: 'proof server unreachable',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const starting = startWithdrawInBrowser({ ...args, withdrawRequest: WITHDRAW_REQUEST })
    if (expectError === undefined) expect(await starting).toBe(withdraw)
    else await expect(starting).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  test('each call receives the request, the keys, the slot and the finalised bytes', async () => {
    const { trail, args } = collaborators({})
    await startWithdrawInBrowser({ ...args, withdrawRequest: WITHDRAW_REQUEST })
    expect(trail.received).toEqual({
      ...NOTHING_RECEIVED,
      prepareStartWithdraw: [{ withdrawRequest: WITHDRAW_REQUEST }],
      buildStart: [
        {
          secretKey: SECRET_KEY,
          wallet: PUBLIC_KEYS,
          inIndex: START_INPUTS.inIndex,
          ...WITHDRAW_REQUEST,
        },
      ],
      finalize: ['unbound-start'],
      startWithdraw: [
        {
          withdrawRequest: WITHDRAW_REQUEST,
          inIndex: START_INPUTS.inIndex,
          finalizedTx: 'finalized(unbound-start)',
        },
      ],
    })
  })

  test('no error carries the caller secret', async () => {
    const { args } = collaborators({ started: STATE_CONFLICT })
    const error: unknown = await startWithdrawInBrowser({
      ...args,
      withdrawRequest: WITHDRAW_REQUEST,
    }).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain(CALLER_SECRET)
  })
})

const COMPLETE_PASS = [
  'stage:preparing',
  'prepareCompleteWithdraw',
  'stage:building',
  'buildComplete',
  'stage:signing',
  'finalize',
  'stage:recording',
  'completeWithdraw',
]

describe('completeWithdrawInBrowser', () => {
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
      name: 'a contract assert while building is the vault refusing the send',
      doubles: { buildFailure: new Error('failed assert: request not attested') },
      expectEvents: COMPLETE_PASS.slice(0, 4),
      expectError: 'the vault refused the send: request not attested',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const completing = completeWithdrawInBrowser({ ...args, name: WITHDRAW_NAME })
    if (expectError === undefined) expect(await completing).toBe(withdraw)
    else await expect(completing).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  test('each call receives the name, the keys, the attested inputs and the finalised bytes', async () => {
    const { trail, args } = collaborators({})
    await completeWithdrawInBrowser({ ...args, name: WITHDRAW_NAME })
    expect(trail.received).toEqual({
      ...NOTHING_RECEIVED,
      prepareCompleteWithdraw: [{ name: WITHDRAW_NAME }],
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
      completeWithdraw: [{ name: WITHDRAW_NAME, finalizedTx: 'finalized(unbound-complete)' }],
    })
  })

  test('every completion draws a fresh 32-byte mint nonce', async () => {
    const { trail, args } = collaborators({})
    await completeWithdrawInBrowser({ ...args, name: WITHDRAW_NAME })
    await completeWithdrawInBrowser({ ...args, name: WITHDRAW_NAME })
    const nonces = trail.received.buildComplete.map((built) => built.mintNonce)
    expect(nonces.map((nonce) => nonce.length)).toEqual([32, 32])
    expect(nonces[0]).not.toEqual(nonces[1])
  })
})
