import { describe, expect, test } from 'vitest'

import { CALLER_CREDENTIAL, CALLER_LOGIN } from '@/lib/caller/caller-fixtures'
import type {
  ApprovalCompleteInputs,
  ApprovalRequest,
  ApprovalStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type {
  ApprovalCallBuilder,
  StartApprovalCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-call-builder'
import {
  APPROVAL_NAME,
  approvalFixture,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-fixtures'
import type {
  CompleteApprovalArgs,
  PrepareCompleteApprovalArgs,
  PrepareStartApprovalArgs,
  StartApprovalArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service'
import type {
  ApprovalCompleteInputsResult,
  ApprovalResult,
  ApprovalStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-adaptor'
import {
  type ApprovalActions,
  completeApprovalInBrowser,
  startApprovalInBrowser,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/browser-approval-calls'
import type { CallerCallStage } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import type { CompleteApproveCircuitArgs } from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import {
  REQUEST_ID,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { userCommitmentOf } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const VAULT_SECRET = 'ab'.repeat(32)
const SECRET_KEY = new Uint8Array(32).fill(0xab)
const PUBLIC_KEYS = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const ROUTER_REQUEST: ApprovalRequest = { kind: 'router', erc20Address: ERC20_ADDRESS }
const STATA_REQUEST: ApprovalRequest = { kind: 'stata' }
const approval = approvalFixture()
const START_INPUTS: ApprovalStartInputs = { inIndex: 42n }
const EXECUTED_INPUTS: ApprovalCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: 'executed',
  attestationOutput: '01',
}
const STATE_CONFLICT_ERROR = 'the approval is not awaiting that'
const STATE_CONFLICT: ApprovalResult = { ok: false, error: STATE_CONFLICT_ERROR }
const RECORD_REFUSAL: ApprovalResult = { ok: false, error: 'the vault ledger could not be read' }

/** Every collaborator call and every stage reported, in order, with the arguments each call received. */
interface Trail {
  readonly events: string[]
  readonly received: Received
}

interface Received {
  readonly prepareStartApproval: PrepareStartApprovalArgs[]
  readonly startApproval: StartApprovalArgs[]
  readonly prepareCompleteApproval: PrepareCompleteApprovalArgs[]
  readonly completeApproval: CompleteApprovalArgs[]
  readonly buildStart: StartApprovalCircuitArgs[]
  readonly buildComplete: CompleteApproveCircuitArgs[]
  readonly finalize: string[]
}

const NOTHING_RECEIVED: Received = {
  prepareStartApproval: [],
  startApproval: [],
  prepareCompleteApproval: [],
  completeApproval: [],
  buildStart: [],
  buildComplete: [],
  finalize: [],
}

interface Doubles {
  readonly started?: ApprovalResult
  readonly completed?: ApprovalResult
  readonly prepareStartRefusal?: ApprovalStartInputsResult
  readonly prepareComplete?: ApprovalCompleteInputsResult
  readonly buildFailure?: Error
}

function collaborators(doubles: Doubles) {
  const trail: Trail = { events: [], received: structuredClone(NOTHING_RECEIVED) }
  const actions = mock<ApprovalActions>('ApprovalActions', {
    prepareStartApproval: async (credential, args) => {
      expect(credential).toBe(CALLER_CREDENTIAL)
      trail.events.push('prepareStartApproval')
      trail.received.prepareStartApproval.push(args)
      return doubles.prepareStartRefusal ?? { ok: true, inputs: START_INPUTS }
    },
    startApproval: async (credential, args) => {
      expect(credential).toBe(CALLER_CREDENTIAL)
      trail.events.push('startApproval')
      trail.received.startApproval.push(args)
      return doubles.started ?? { ok: true, approval }
    },
    prepareCompleteApproval: async (credential, args) => {
      expect(credential).toBe(CALLER_CREDENTIAL)
      trail.events.push('prepareCompleteApproval')
      trail.received.prepareCompleteApproval.push(args)
      return doubles.prepareComplete ?? { ok: true, inputs: EXECUTED_INPUTS }
    },
    completeApproval: async (credential, args) => {
      expect(credential).toBe(CALLER_CREDENTIAL)
      trail.events.push('completeApproval')
      trail.received.completeApproval.push(args)
      return doubles.completed ?? { ok: true, approval }
    },
  })
  const builder = mock<ApprovalCallBuilder>('ApprovalCallBuilder', {
    buildStart: async (args: StartApprovalCircuitArgs) => {
      trail.events.push('buildStart')
      trail.received.buildStart.push(args)
      if (doubles.buildFailure !== undefined) throw doubles.buildFailure
      return 'unbound-start'
    },
    buildComplete: async (args: CompleteApproveCircuitArgs) => {
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
  'prepareStartApproval',
  'stage:building',
  'buildStart',
  'stage:signing',
  'finalize',
  'stage:recording',
  'startApproval',
]

describe('startApprovalInBrowser', () => {
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
      doubles: { prepareStartRefusal: { ok: false, error: 'approvalRequest.erc20Address' } },
      expectEvents: ['stage:preparing', 'prepareStartApproval'],
      expectError: 'approvalRequest.erc20Address',
    },
    {
      name: 'the deployer gate firing while building is the vault refusing the approval',
      doubles: { buildFailure: new Error('failed assert: Not the deployer') },
      expectEvents: START_PASS.slice(0, 4),
      expectError: 'the vault refused the approval: Not the deployer',
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
    const starting = startApprovalInBrowser({ ...args, approvalRequest: ROUTER_REQUEST })
    if (expectError === undefined) expect(await starting).toBe(approval)
    else await expect(starting).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  const kinds: ReadonlyArray<{
    name: string
    approvalRequest: ApprovalRequest
    expectBuilt: StartApprovalCircuitArgs
  }> = [
    {
      name: 'a router approval builds over its token',
      approvalRequest: ROUTER_REQUEST,
      expectBuilt: {
        kind: 'router',
        erc20Address: ERC20_ADDRESS,
        secretKey: SECRET_KEY,
        wallet: PUBLIC_KEYS,
        inIndex: START_INPUTS.inIndex,
      },
    },
    {
      name: 'a stata approval builds over the slot alone',
      approvalRequest: STATA_REQUEST,
      expectBuilt: {
        kind: 'stata',
        secretKey: SECRET_KEY,
        wallet: PUBLIC_KEYS,
        inIndex: START_INPUTS.inIndex,
      },
    },
  ]

  test.each(kinds)(
    '$name, and each call receives the request, the slot and the finalised bytes',
    async ({ approvalRequest, expectBuilt }) => {
      const { trail, args } = collaborators({})
      await startApprovalInBrowser({ ...args, approvalRequest })
      expect(trail.received).toEqual({
        ...NOTHING_RECEIVED,
        prepareStartApproval: [{ approvalRequest }],
        buildStart: [expectBuilt],
        finalize: ['unbound-start'],
        startApproval: [
          {
            approvalRequest,
            userCommitment: userCommitmentOf(VAULT_SECRET),
            inIndex: START_INPUTS.inIndex,
            finalizedTx: 'finalized(unbound-start)',
          },
        ],
      })
    },
  )

  test('no error carries the vault secret', async () => {
    const { args } = collaborators({ started: STATE_CONFLICT })
    const error: unknown = await startApprovalInBrowser({
      ...args,
      approvalRequest: STATA_REQUEST,
    }).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain(VAULT_SECRET)
  })
})

const COMPLETE_PASS = [
  'stage:preparing',
  'prepareCompleteApproval',
  'stage:building',
  'buildComplete',
  'stage:signing',
  'finalize',
  'stage:recording',
  'completeApproval',
]

describe('completeApprovalInBrowser', () => {
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
      expectEvents: [...COMPLETE_PASS],
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a refused prepare surfaces before anything is built',
      doubles: { prepareComplete: STATE_CONFLICT },
      expectEvents: ['stage:preparing', 'prepareCompleteApproval'],
      expectError: STATE_CONFLICT_ERROR,
    },
    {
      name: 'a contract assert while building is the vault refusing the approval',
      doubles: { buildFailure: new Error('failed assert: Request event missing') },
      expectEvents: COMPLETE_PASS.slice(0, 4),
      expectError: 'the vault refused the approval: Request event missing',
    },
  ]

  test.each(cases)('$name', async ({ doubles, expectEvents, expectError }) => {
    const { trail, args } = collaborators(doubles)
    const completing = completeApprovalInBrowser({ ...args, name: APPROVAL_NAME })
    if (expectError === undefined) expect(await completing).toBe(approval)
    else await expect(completing).rejects.toThrow(expectError)
    expect(trail.events).toEqual(expectEvents)
  })

  const outputs: ReadonlyArray<{
    name: string
    inputs: ApprovalCompleteInputs
    expectOutput: Uint8Array
  }> = [
    {
      name: 'the attested result byte of an executed approval',
      inputs: EXECUTED_INPUTS,
      expectOutput: new Uint8Array([1]),
    },
    {
      name: 'one zero byte for a failed approval, which the circuit ignores',
      inputs: { requestId: REQUEST_ID_HEX, attestationOutputKind: 'failed', attestationOutput: '' },
      expectOutput: new Uint8Array(1),
    },
  ]

  test.each(outputs)(
    'each call receives the name, the keys, $name and the finalised bytes, and no nonce',
    async ({ inputs, expectOutput }) => {
      const { trail, args } = collaborators({ prepareComplete: { ok: true, inputs } })
      await completeApprovalInBrowser({ ...args, name: APPROVAL_NAME })
      expect(trail.received).toEqual({
        ...NOTHING_RECEIVED,
        prepareCompleteApproval: [{ name: APPROVAL_NAME }],
        buildComplete: [
          {
            secretKey: SECRET_KEY,
            wallet: PUBLIC_KEYS,
            requestId: REQUEST_ID,
            serializedOutput: expectOutput,
          },
        ],
        finalize: ['unbound-complete'],
        completeApproval: [{ name: APPROVAL_NAME, finalizedTx: 'finalized(unbound-complete)' }],
      })
    },
  )
})
