import { bytesToHex } from '@sig-net/midnight'
import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { Approval } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import { approvalFixture } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-fixtures'
import { ApprovalServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-impl'
import {
  ApprovalStateConflict,
  type ApprovalStateController,
  type StartApprovalArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-controller'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type {
  CompleteApproveCircuitArgs,
  StartApproveRouterCircuitArgs,
  StartApproveStataCircuitArgs,
  VaultCircuits,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { SpenderLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import { ledgerSet } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  REQUEST_ID,
  VAULT_REQUEST_IN_STATE,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { MemoryRepository } from '@/lib/repository/repository-memory-impl'
import { mock } from '@/lib/testing/mock'
import { UUID } from '@/lib/value-schemas'

/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET: MidnightSignetConfig = {
  contractAddress: '11'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'22'.repeat(32)}`, false),
}
const VAULT: MidnightEthereumErc20VaultConfig = { contractAddress: '33'.repeat(32) }

const caller: Caller = resolveCaller('ab'.repeat(32))
const WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }

const TOKEN_A = new Uint8Array(20).fill(0xa1)
const TOKEN_B = new Uint8Array(20).fill(0xb2)
const ROUTER = new Uint8Array(20).fill(0x0a)
const STATA_UNDERLYING = new Uint8Array(20).fill(0x0b)
const STATA_TOKEN = new Uint8Array(20).fill(0x0c)
const hex = (bytes: Uint8Array): string => `0x${bytesToHex(bytes)}`

interface Recorded {
  steps: string[]
  routerBuilds: StartApproveRouterCircuitArgs[]
  stataBuilds: StartApproveStataCircuitArgs[]
  completeBuilds: CompleteApproveCircuitArgs[]
  started: StartApprovalArgs[]
  allowanceReads: [string, string, string][]
}

function serviceOver(options: {
  approvals?: Approval[]
  requests?: VaultRequest[]
  allowances?: Record<string, bigint>
}) {
  const recorded: Recorded = {
    steps: [],
    routerBuilds: [],
    stataBuilds: [],
    completeBuilds: [],
    started: [],
    allowanceReads: [],
  }
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
        const { unprovenTx: _unprovenTx, ...approval } = args
        return approvalFixture(approval)
      },
      completeApproval: async (args) =>
        approvalFixture({ name: args.name, state: 'AwaitingCompleteTransaction' }),
    }),
    vaultRequestRepository,
    mock<VaultCircuits>('VaultCircuits', {
      startApproveRouter: async (args) => {
        recorded.steps.push('build')
        recorded.routerBuilds.push(args)
        return 'router-call'
      },
      startApproveStata: async (args) => {
        recorded.steps.push('build')
        recorded.stataBuilds.push(args)
        return 'stata-call'
      },
      completeApprove: async (args) => {
        recorded.steps.push('build')
        recorded.completeBuilds.push(args)
        return 'complete-call'
      },
    }),
    mock<SpenderLedger>('SpenderLedger', {
      state: async () => ({
        allowedTokens: ledgerSet([TOKEN_A, TOKEN_B]),
        uniswapRouter: ROUTER,
        stataUnderlying: STATA_UNDERLYING,
        stataToken: STATA_TOKEN,
      }),
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

const VAULT_ACCOUNT = vaultAccountOf(SIGNET, VAULT)

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

describe('ApprovalServiceImpl.startApproval', () => {
  test('a router approval builds the router call for the token and stores the pinned router as the spender', async () => {
    const { service, recorded } = serviceOver({})
    const approval = await service.startApproval(caller, {
      approvalRequest: { kind: 'router', erc20Address: hex(TOKEN_B) },
      wallet: WALLET,
    })
    expect(recorded.steps).toEqual(['build', 'transaction'])
    expect(recorded.routerBuilds).toEqual([
      {
        secretKey: caller.secretKey,
        wallet: WALLET,
        inIndex: approval.inIndex,
        erc20Address: hex(TOKEN_B),
      },
    ])
    expect(recorded.started).toEqual([
      {
        name: expect.stringMatching(
          new RegExp(`^${caller.name}/ethereum-erc20-vault-approvals/${UUID}$`),
        ),
        kind: 'router',
        erc20Address: hex(TOKEN_B),
        spender: hex(ROUTER),
        inIndex: approval.inIndex,
        vaultAccount: VAULT_ACCOUNT,
        unprovenTx: 'router-call',
      },
    ])
  })

  test('a stata approval reads both addresses from the ledger', async () => {
    const { service, recorded } = serviceOver({})
    const approval = await service.startApproval(caller, {
      approvalRequest: { kind: 'stata' },
      wallet: WALLET,
    })
    expect(recorded.stataBuilds).toEqual([
      { secretKey: caller.secretKey, wallet: WALLET, inIndex: approval.inIndex },
    ])
    expect(recorded.started[0]).toMatchObject({
      kind: 'stata',
      erc20Address: hex(STATA_UNDERLYING),
      spender: hex(STATA_TOKEN),
      unprovenTx: 'stata-call',
    })
  })
})

describe('ApprovalServiceImpl.completeApproval', () => {
  const own = (overrides: Partial<Approval>) =>
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

  test('builds the complete call over the attested byte, then records it', async () => {
    const stored = own({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      approvals: [stored],
      requests: [attestedUnder(stored.name)],
    })
    await ready
    const approval = await service.completeApproval(caller, { name: stored.name, wallet: WALLET })
    expect(approval.state).toBe('AwaitingCompleteTransaction')
    expect(recorded.steps).toEqual(['build', 'transaction'])
    expect(recorded.completeBuilds).toEqual([
      {
        secretKey: caller.secretKey,
        wallet: WALLET,
        requestId: REQUEST_ID,
        serializedOutput: new Uint8Array([1]),
      },
    ])
  })

  test('refuses before the build when the state does not allow a completion', async () => {
    const stored = own({ state: 'AwaitingVaultRequest' })
    const { service, recorded, ready } = serviceOver({ approvals: [stored] })
    await ready
    await expect(
      service.completeApproval(caller, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow(ApprovalStateConflict)
    expect(recorded.steps).toEqual([])
  })
})
