import { hexToBytes } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import { CALLER_CREDENTIAL, CALLER_LOGIN } from '@/lib/caller/caller-fixtures'
import type { CallerCallStage } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import {
  completeRedeemInBrowser,
  type RedeemActions,
  startRedeemInBrowser,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/browser-redeem-calls'
import type {
  RedeemCompleteInputs,
  RedeemStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { RedeemCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-call-builder'
import {
  REDEEM_NAME,
  redeemFixture,
  STATA_ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-fixtures'
import type {
  CompleteRedeemArgs,
  PrepareCompleteRedeemArgs,
  PrepareStartRedeemArgs,
  StartRedeemArgs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service'
import type {
  RedeemCompleteInputsResult,
  RedeemResult,
  RedeemStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-adaptor'
import type {
  CompleteRedeemCircuitArgs,
  StartRedeemCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import {
  REQUEST_ID,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const VAULT_SECRET = 'ab'.repeat(32)
const SECRET_KEY = new Uint8Array(32).fill(0xab)
const PUBLIC_KEYS = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const REDEEM_REQUEST = { shares: 300_000n }
const redeem = redeemFixture()
const START_INPUTS: RedeemStartInputs = { inIndex: 42n, stataErc20Address: STATA_ERC20_ADDRESS }
/** The underlying the wrapper paid out, a little-endian `uint256`. */
const ASSETS_OUTPUT = `40420f${'00'.repeat(29)}`
const EXECUTED_INPUTS: RedeemCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: 'executed',
  attestationOutput: ASSETS_OUTPUT,
}
const STATE_CONFLICT_ERROR = 'the redeem is not awaiting that'
const STATE_CONFLICT: RedeemResult = { ok: false, error: STATE_CONFLICT_ERROR }
const RECORD_REFUSAL: RedeemResult = { ok: false, error: 'the vault ledger could not be read' }

/** Every collaborator call and every stage reported, in order, with the arguments each call received. */
interface Trail {
  readonly events: string[]
  readonly received: Received
}

interface Received {
  readonly prepareStartRedeem: PrepareStartRedeemArgs[]
  readonly startRedeem: StartRedeemArgs[]
  readonly prepareCompleteRedeem: PrepareCompleteRedeemArgs[]
  readonly completeRedeem: CompleteRedeemArgs[]
  readonly buildStart: StartRedeemCircuitArgs[]
  readonly buildComplete: CompleteRedeemCircuitArgs[]
  readonly finalize: string[]
}

const NOTHING_RECEIVED: Received = {
  prepareStartRedeem: [],
  startRedeem: [],
  prepareCompleteRedeem: [],
  completeRedeem: [],
  buildStart: [],
  buildComplete: [],
  finalize: [],
}

interface Doubles {
  readonly started?: RedeemResult
  readonly completed?: RedeemResult
  readonly prepareStartRefusal?: RedeemStartInputsResult
  readonly prepareComplete?: RedeemCompleteInputsResult
  readonly buildFailure?: Error
}

function collaborators(doubles: Doubles) {
  const trail: Trail = { events: [], received: structuredClone(NOTHING_RECEIVED) }
  const actions = mock<RedeemActions>('RedeemActions', {
    prepareStartRedeem: async (credential, args) => {
      expect(credential).toBe(CALLER_CREDENTIAL)
      trail.events.push('prepareStartRedeem')
      trail.received.prepareStartRedeem.push(args)
      return doubles.prepareStartRefusal ?? { ok: true, inputs: START_INPUTS }
    },
    startRedeem: async (credential, args) => {
      expect(credential).toBe(CALLER_CREDENTIAL)
      trail.events.push('startRedeem')
      trail.received.startRedeem.push(args)
      return doubles.started ?? { ok: true, redeem }
    },
    prepareCompleteRedeem: async (credential, args) => {
      expect(credential).toBe(CALLER_CREDENTIAL)
      trail.events.push('prepareCompleteRedeem')
      trail.received.prepareCompleteRedeem.push(args)
      return doubles.prepareComplete ?? { ok: true, inputs: EXECUTED_INPUTS }
    },
    completeRedeem: async (credential, args) => {
      expect(credential).toBe(CALLER_CREDENTIAL)
      trail.events.push('completeRedeem')
      trail.received.completeRedeem.push(args)
      return doubles.completed ?? { ok: true, redeem }
    },
  })
  const builder = mock<RedeemCallBuilder>('RedeemCallBuilder', {
    buildStart: async (args: StartRedeemCircuitArgs) => {
      trail.events.push('buildStart')
      trail.received.buildStart.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-start'
    },
    buildComplete: async (args: CompleteRedeemCircuitArgs) => {
      trail.events.push('buildComplete')
      trail.received.buildComplete.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-complete'
    },
  })
  const wallet = mock<Wallet>('Wallet', {
    publicKeys: PUBLIC_KEYS,
    balanceUnsealedTransaction: async (unboundTx) => {
      trail.events.push('finalize')
      trail.received.finalize.push(unboundTx)
      return { tx: `finalized(${unboundTx})` }
    },
  })
  const onStage = (stage: CallerCallStage): void => {
    trail.events.push(`stage:${stage}`)
  }
  return {
    trail,
    args: {
      actions,
      builder,
      wallet,
      login: CALLER_LOGIN,
      vaultSecret: VAULT_SECRET,
      onStage,
    },
  }
}

const START_PASS = [
  'stage:preparing',
  'prepareStartRedeem',
  'stage:building',
  'buildStart',
  'stage:signing',
  'finalize',
  'stage:recording',
  'startRedeem',
]

describe('startRedeemInBrowser', () => {
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
      expectEvents: [...START_PASS],
      expectError: 'the vault ledger could not be read',
    },
    {
      name: 'a refused prepare surfaces before anything is built',
      doubles: { prepareStartRefusal: { ok: false, error: 'redeemRequest.shares' } },
      expectEvents: ['stage:preparing', 'prepareStartRedeem'],
      expectError: 'redeemRequest.shares',
    },
    {
      name: 'a contract assert while building is the vault refusing the redeem',
      doubles: { buildFailure: new Error('failed assert: Coin is not the vault token') },
      expectEvents: START_PASS.slice(0, 4),
      expectError: 'the vault refused the redeem: Coin is not the vault token',
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
    const starting = startRedeemInBrowser({ ...args, redeemRequest: REDEEM_REQUEST })
    if (expectError === undefined) expect(await starting).toBe(redeem)
    else await expect(starting).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  test('each call receives the shares, the keys, the slot, the wrapper and the finalised bytes', async () => {
    const { trail, args } = collaborators({})
    await startRedeemInBrowser({ ...args, redeemRequest: REDEEM_REQUEST })
    expect(trail.received).toEqual({
      ...NOTHING_RECEIVED,
      prepareStartRedeem: [{ redeemRequest: REDEEM_REQUEST }],
      buildStart: [
        {
          secretKey: SECRET_KEY,
          wallet: PUBLIC_KEYS,
          inIndex: START_INPUTS.inIndex,
          stataErc20Address: STATA_ERC20_ADDRESS,
          shares: REDEEM_REQUEST.shares,
        },
      ],
      finalize: ['unbound-start'],
      startRedeem: [
        {
          redeemRequest: REDEEM_REQUEST,
          inIndex: START_INPUTS.inIndex,
          finalizedTx: 'finalized(unbound-start)',
        },
      ],
    })
  })

  test('no error carries the vault secret', async () => {
    const { args } = collaborators({ started: STATE_CONFLICT })
    const error: unknown = await startRedeemInBrowser({
      ...args,
      redeemRequest: REDEEM_REQUEST,
    }).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain(VAULT_SECRET)
  })
})

const COMPLETE_PASS = [
  'stage:preparing',
  'prepareCompleteRedeem',
  'stage:building',
  'buildComplete',
  'stage:signing',
  'finalize',
  'stage:recording',
  'completeRedeem',
]

describe('completeRedeemInBrowser', () => {
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
      name: 'a refused prepare surfaces before anything is built',
      doubles: { prepareComplete: STATE_CONFLICT },
      expectEvents: COMPLETE_PASS.slice(0, 2),
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a refused record surfaces without a retry',
      doubles: { completed: STATE_CONFLICT },
      expectEvents: [...COMPLETE_PASS],
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a contract assert while building is the vault refusing the redeem',
      doubles: { buildFailure: new Error('failed assert: request not attested') },
      expectEvents: COMPLETE_PASS.slice(0, 4),
      expectError: 'the vault refused the redeem: request not attested',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const completing = completeRedeemInBrowser({ ...args, name: REDEEM_NAME })
    if (expectError === undefined) expect(await completing).toBe(redeem)
    else await expect(completing).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  const outputs: ReadonlyArray<{
    name: string
    inputs: RedeemCompleteInputs
    expectOutput: Uint8Array
  }> = [
    {
      name: 'the attested assets of an executed redeem',
      inputs: EXECUTED_INPUTS,
      expectOutput: hexToBytes(ASSETS_OUTPUT),
    },
    {
      name: '32 zero bytes for a failed redeem, which the circuit ignores',
      inputs: { ...EXECUTED_INPUTS, attestationOutputKind: 'failed', attestationOutput: '' },
      expectOutput: new Uint8Array(32),
    },
  ]

  test.each(outputs)(
    'each call receives the name, the keys, $name and the finalised bytes',
    async ({ inputs, expectOutput }) => {
      const { trail, args } = collaborators({ prepareComplete: { ok: true, inputs } })
      await completeRedeemInBrowser({ ...args, name: REDEEM_NAME })
      expect(trail.received).toEqual({
        ...NOTHING_RECEIVED,
        prepareCompleteRedeem: [{ name: REDEEM_NAME }],
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
        completeRedeem: [{ name: REDEEM_NAME, finalizedTx: 'finalized(unbound-complete)' }],
      })
    },
  )

  test('every completion draws a fresh 32-byte mint nonce', async () => {
    const { trail, args } = collaborators({})
    await completeRedeemInBrowser({ ...args, name: REDEEM_NAME })
    await completeRedeemInBrowser({ ...args, name: REDEEM_NAME })
    const nonces = trail.received.buildComplete.map((built) => built.mintNonce)
    expect(nonces.map((nonce) => nonce.length)).toEqual([32, 32])
    expect(nonces[0]).not.toEqual(nonces[1])
  })
})
