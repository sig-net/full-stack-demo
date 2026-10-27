import { bytesToHex } from '@sig-net/midnight'
import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { CALLER, STRANGER } from '@/lib/caller/caller-fixtures'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type {
  Approval,
  ApprovalRequest,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import {
  approvalFixture,
  USER_COMMITMENT,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-fixtures'
import { ApprovalServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-impl'
import {
  ApprovalStateConflict,
  type ApprovalStateController,
  type CompleteApprovalArgs,
  type StartApprovalArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-controller'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type { SpenderLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import { ledgerSet } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  REQUEST_ID_HEX,
  VAULT_REQUEST_IN_STATE,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { MemoryRepository } from '@/lib/repository/repository-memory-impl'
import { mock } from '@/lib/testing/mock'
import { UINT64_MAX, UUID } from '@/lib/value-schemas'

/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET: MidnightSignetConfig = {
  contractAddress: '11'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'22'.repeat(32)}`, false),
}
const VAULT: MidnightEthereumErc20VaultConfig = { contractAddress: '33'.repeat(32) }
const VAULT_ACCOUNT = vaultAccountOf(SIGNET, VAULT)

const caller: Caller = CALLER
const stranger: Caller = STRANGER
const FINALIZED_TX = 'f1a1'

const TOKEN_A = new Uint8Array(20).fill(0xa1)
const TOKEN_B = new Uint8Array(20).fill(0xb2)
const ROUTER = new Uint8Array(20).fill(0x0a)
const STATA_UNDERLYING = new Uint8Array(20).fill(0x0b)
const STATA_TOKEN = new Uint8Array(20).fill(0x0c)
const hex = (bytes: Uint8Array): string => `0x${bytesToHex(bytes)}`

/** What the service read, wrote, in order, so a test can see that a refusal writes nothing and a commit opens one transaction after its reads. */
interface Recorded {
  steps: string[]
  started: StartApprovalArgs[]
  completed: CompleteApprovalArgs[]
  allowanceReads: string[][]
}

const NOTHING_RECORDED: Recorded = {
  steps: [],

  started: [],
  completed: [],
  allowanceReads: [],
}

function serviceOver(options: {
  approvals?: Approval[]
  requests?: VaultRequest[]
  allowances?: Record<string, bigint>
  initialised?: boolean
}) {
  const recorded: Recorded = structuredClone(NOTHING_RECORDED)
  const approvalRepository = new MemoryRepository<Approval>()
  const vaultRequestRepository = new MemoryRepository<VaultRequest>()
  const ready = Promise.all([
    ...(options.approvals ?? []).map((approval) => approvalRepository.create(approval)),
    ...(options.requests ?? []).map((request) => vaultRequestRepository.create(request)),
  ])
  const service = new ApprovalServiceImpl(
    approvalRepository,
    mock<ApprovalStateController>('ApprovalStateController', {
      startApproval: async (args) => {
        recorded.started.push(args)
        const { call: _call, ...approval } = args
        return approvalFixture(approval)
      },
      completeApproval: async (args) => {
        recorded.completed.push(args)
        return approvalFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
      },
    }),
    vaultRequestRepository,
    mock<SpenderLedger>('SpenderLedger', {
      state: async () => {
        recorded.steps.push('ledger')
        return {
          initialised: options.initialised ?? true,
          allowedTokens: ledgerSet([TOKEN_A, TOKEN_B]),
          uniswapRouter: ROUTER,
          stataUnderlying: STATA_UNDERLYING,
          stataToken: STATA_TOKEN,
        }
      },
    }),
    mock<Erc20Reader>('Erc20Reader', {
      allowance: async (erc20Address, owner, spender) => {
        recorded.allowanceReads.push([erc20Address, owner, spender])
        return options.allowances?.[`${erc20Address}:${spender}`] ?? 0n
      },
    }),
    mock<UnitOfWork>('UnitOfWork', {
      runInTransaction: (work) => {
        recorded.steps.push('transaction')
        return work()
      },
    }),
    SIGNET,
    VAULT,
  )
  return { service, recorded, ready }
}

describe('ApprovalServiceImpl.listApprovalTargets', () => {
  test('the router on each allowed token and the wrapper on its underlying, with the chain allowance', async () => {
    const { service, recorded } = serviceOver({
      allowances: { [`${hex(TOKEN_A)}:${hex(ROUTER)}`]: 7n },
    })
    expect(await service.listApprovalTargets(caller, {})).toEqual([
      { kind: 'router', erc20Address: hex(TOKEN_A), spender: hex(ROUTER), allowance: 7n },
      { kind: 'router', erc20Address: hex(TOKEN_B), spender: hex(ROUTER), allowance: 0n },
      {
        kind: 'stata',
        erc20Address: hex(STATA_UNDERLYING),
        spender: hex(STATA_TOKEN),
        allowance: 0n,
      },
    ])
    expect(recorded.allowanceReads.every(([, owner]) => owner === VAULT_ACCOUNT)).toBe(true)
  })
})

describe('ApprovalServiceImpl on an uninitialised vault', () => {
  test.each<{
    name: string
    call: (service: ApprovalServiceImpl) => Promise<unknown>
    steps: string[]
  }>([
    {
      name: 'listApprovalTargets refuses before reading an allowance at a zero address',
      call: (service) => service.listApprovalTargets(caller, {}),
      steps: ['ledger'],
    },
    {
      name: 'startApproval refuses before committing a grant of zero addresses',
      call: (service) =>
        service.startApproval(caller, {
          approvalRequest: { kind: 'stata' },
          userCommitment: USER_COMMITMENT,
          inIndex: 42n,
          finalizedTx: FINALIZED_TX,
        }),
      steps: ['ledger'],
    },
  ])('$name', async ({ call, steps }) => {
    const { service, recorded } = serviceOver({ initialised: false })
    await expect(call(service)).rejects.toThrow(
      'The vault is not initialised: its deployer has not run initialise.',
    )
    expect(recorded).toEqual({ ...NOTHING_RECORDED, steps })
  })
})

/** Each kind of approval: the start circuit its finalised call must be, and the grant the ledger pins for it. */
const kinds: ReadonlyArray<{
  name: string
  approvalRequest: ApprovalRequest
  expectGrant: Pick<Approval, 'kind' | 'erc20Address' | 'spender'>
}> = [
  {
    name: "a router approval grants the pinned router on the request's token",
    approvalRequest: { kind: 'router', erc20Address: hex(TOKEN_B) },
    expectGrant: { kind: 'router', erc20Address: hex(TOKEN_B), spender: hex(ROUTER) },
  },
  {
    name: 'a stata approval grants the pinned wrapper on its pinned underlying',
    approvalRequest: { kind: 'stata' },
    expectGrant: {
      kind: 'stata',
      erc20Address: hex(STATA_UNDERLYING),
      spender: hex(STATA_TOKEN),
    },
  },
]

describe('ApprovalServiceImpl.prepareStartApproval', () => {
  test.each(kinds)(
    '$name: a fresh slot on every call, and nothing is read or written',
    async ({ approvalRequest }) => {
      const { service, recorded } = serviceOver({})
      const first = await service.prepareStartApproval(caller, { approvalRequest })
      const second = await service.prepareStartApproval(caller, { approvalRequest })
      for (const inputs of [first, second]) {
        expect(Object.keys(inputs)).toEqual(['inIndex'])
        expect(inputs.inIndex).toBeGreaterThanOrEqual(0n)
        expect(inputs.inIndex).toBeLessThanOrEqual(UINT64_MAX)
      }
      expect(first.inIndex).not.toBe(second.inIndex)
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )
})

describe('ApprovalServiceImpl.startApproval', () => {
  test.each(kinds)(
    "$name: reads the ledger and commits the kind's finalised call in one transaction",
    async ({ approvalRequest, expectGrant }) => {
      const { service, recorded } = serviceOver({})
      const approval = await service.startApproval(caller, {
        approvalRequest,
        userCommitment: USER_COMMITMENT,
        inIndex: 42n,
        finalizedTx: FINALIZED_TX,
      })
      expect(approval.name).toMatch(
        new RegExp(`^${caller.name}/ethereum-erc20-vault-approvals/${UUID}$`),
      )
      expect(recorded).toEqual({
        ...NOTHING_RECORDED,
        steps: ['ledger', 'transaction'],
        started: [
          {
            name: approval.name,
            ...expectGrant,
            userCommitment: USER_COMMITMENT,
            inIndex: 42n,
            vaultAccount: VAULT_ACCOUNT,
            call: { finalizedTx: FINALIZED_TX },
          },
        ],
      })
    },
  )
})

const ownApproval = (overrides: Partial<Approval>) =>
  approvalFixture({
    name: `${caller.name}/ethereum-erc20-vault-approvals/3b4c5d6e-7f80-4912-8a2b-3c4d5e6f7a8b`,
    ...overrides,
  })
const attestedUnder = (parent: string, overrides: Partial<VaultRequest> = {}) => ({
  ...VAULT_REQUEST_IN_STATE.Attested,
  name: `${caller.name}/ethereum-erc20-vault-requests/7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f`,
  parent,
  action: 'approve' as const,
  ...overrides,
})
const awaiting = ownApproval({ state: 'AwaitingCompletion' })

interface Refusal {
  name: string
  by: Caller
  approvals: Approval[]
  requests: VaultRequest[]
  expectError: string | typeof ApprovalStateConflict
}

/** What both completion methods refuse before anything is read from the request. */
const refusedCompletions: readonly Refusal[] = [
  {
    name: "another caller's approval does not exist for this caller",
    by: stranger,
    approvals: [awaiting],
    requests: [attestedUnder(awaiting.name)],
    expectError: 'does not exist',
  },
  {
    name: 'an approval that was never started',
    by: caller,
    approvals: [],
    requests: [],
    expectError: 'does not exist',
  },
  {
    name: 'an approval still waiting for its request',
    by: caller,
    approvals: [ownApproval({ state: 'AwaitingVaultRequest' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: ApprovalStateConflict,
  },
  {
    name: 'an approval already completing',
    by: caller,
    approvals: [ownApproval({ state: 'AwaitingCompleteTransaction' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: ApprovalStateConflict,
  },
]

/** What the request read refuses, which only the prepare method makes. */
const refusedPreparations: readonly Refusal[] = [
  {
    name: 'an approval whose request holds no attestation',
    by: caller,
    approvals: [awaiting],
    requests: [
      attestedUnder(awaiting.name, {
        state: 'AwaitingBroadcast',
        attestationBlockHeight: null,
        attestationOutputKind: null,
        attestationDigest: null,
        attestationSignature: null,
        attestationOutput: null,
      }),
    ],
    expectError: 'holds no attestation',
  },
  {
    name: 'an approval without a request row',
    by: caller,
    approvals: [awaiting],
    requests: [],
    expectError: 'has no vault request',
  },
]

async function expectRefusal(
  refused: Promise<unknown>,
  expectError: Refusal['expectError'],
): Promise<void> {
  if (typeof expectError === 'string') await expect(refused).rejects.toThrow(expectError)
  else await expect(refused).rejects.toBeInstanceOf(expectError)
}

describe('ApprovalServiceImpl.prepareCompleteApproval', () => {
  const inputs: ReadonlyArray<{
    name: string
    request: VaultRequest
    expectKind: 'executed' | 'failed' | 'unviable'
    expectOutput: string | null
  }> = [
    {
      name: "an executed approval's attested result",
      request: attestedUnder(awaiting.name),
      expectKind: 'executed',
      expectOutput: VAULT_REQUEST_IN_STATE.Attested.attestationOutput,
    },
    {
      name: 'a failed approval, whose output is empty',
      request: attestedUnder(awaiting.name, {
        attestationOutputKind: 'failed',
        attestationOutput: '',
      }),
      expectKind: 'failed',
      expectOutput: '',
    },
  ]

  test.each(inputs)(
    "returns the attested request's fields for $name, and nothing is written",
    async ({ request, expectKind, expectOutput }) => {
      const { service, recorded, ready } = serviceOver({
        approvals: [awaiting],
        requests: [request],
      })
      await ready
      expect(await service.prepareCompleteApproval(caller, { name: awaiting.name })).toEqual({
        requestId: REQUEST_ID_HEX,
        attestationOutputKind: expectKind,
        attestationOutput: expectOutput,
      })
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )

  test.each([...refusedCompletions, ...refusedPreparations])(
    '$name: nothing is written',
    async ({ by, approvals, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ approvals, requests })
      await ready
      await expectRefusal(service.prepareCompleteApproval(by, { name: awaiting.name }), expectError)
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )
})

describe('ApprovalServiceImpl.completeApproval', () => {
  test('commits the finalised call in one transaction after the state check', async () => {
    const { service, recorded, ready } = serviceOver({
      approvals: [awaiting],
      requests: [attestedUnder(awaiting.name)],
    })
    await ready
    const approval = await service.completeApproval(caller, {
      name: awaiting.name,
      finalizedTx: FINALIZED_TX,
    })
    expect(approval.state).toBe('AwaitingCompleteTransaction')
    expect(recorded).toEqual({
      ...NOTHING_RECORDED,
      steps: ['transaction'],
      completed: [{ name: awaiting.name, call: { finalizedTx: FINALIZED_TX } }],
    })
  })

  test.each(refusedCompletions)(
    '$name: nothing is written',
    async ({ by, approvals, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ approvals, requests })
      await ready
      await expectRefusal(
        service.completeApproval(by, { name: awaiting.name, finalizedTx: FINALIZED_TX }),
        expectError,
      )
      expect(recorded).toEqual({
        ...NOTHING_RECORDED,
        steps: [],
      })
    },
  )
})

describe('ApprovalServiceImpl reads', () => {
  test("lists the caller's approvals newest first and gets only its own", async () => {
    const older = ownApproval({ createTime: new Date('2026-01-01T00:00:00Z') })
    const newer = ownApproval({
      name: `${caller.name}/ethereum-erc20-vault-approvals/4b4c5d6e-7f80-4912-8a2b-3c4d5e6f7a8b`,
      createTime: new Date('2026-01-02T00:00:00Z'),
    })
    const theirs = approvalFixture({
      name: `${stranger.name}/ethereum-erc20-vault-approvals/5b4c5d6e-7f80-4912-8a2b-3c4d5e6f7a8b`,
    })
    const { service, ready } = serviceOver({ approvals: [older, newer, theirs] })
    await ready
    expect(await service.listApprovals(caller, {})).toEqual([newer, older])
    expect(await service.getApproval(caller, { name: theirs.name })).toBeUndefined()
    expect(await service.getApproval(stranger, { name: theirs.name })).toEqual(theirs)
  })
})
