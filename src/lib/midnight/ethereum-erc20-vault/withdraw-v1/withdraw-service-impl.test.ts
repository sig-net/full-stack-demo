import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import {
  type SponsoredCallGuard,
  SponsoredCallMismatch,
  type SponsoredCircuit,
} from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID_HEX,
  VAULT_REQUEST_IN_STATE,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { Withdraw } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import {
  DESTINATION,
  ERC20_ADDRESS,
  withdrawFixture,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-fixtures'
import { WithdrawServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-impl'
import {
  type CompleteWithdrawArgs,
  type StartWithdrawArgs,
  WithdrawStateConflict,
  type WithdrawStateController,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-controller'
import { MemoryRepository } from '@/lib/repository/repository-memory-impl'
import { mock } from '@/lib/testing/mock'
import { UINT64_MAX, UUID } from '@/lib/value-schemas'

/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET: MidnightSignetConfig = {
  contractAddress: '11'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'22'.repeat(32)}`, false),
}
const VAULT: MidnightEthereumErc20VaultConfig = { contractAddress: '33'.repeat(32) }

const caller: Caller = resolveCaller('ab'.repeat(32))
const stranger: Caller = resolveCaller('cd'.repeat(32))
const REQUEST = { erc20Address: ERC20_ADDRESS, amount: 1_000_000n, destEvmAddress: DESTINATION }
const BOUND_TX = 'b0bd'

/** What the service wrote and asked the guard, so a test can see that a refusal writes nothing and a commit opens one transaction. */
interface Recorded {
  transactions: number
  guarded: SponsoredCircuit[]
  started: StartWithdrawArgs[]
  completed: CompleteWithdrawArgs[]
}

const NOTHING_RECORDED: Recorded = { transactions: 0, guarded: [], started: [], completed: [] }

function serviceOver(options: {
  withdraws?: Withdraw[]
  requests?: VaultRequest[]
  /** Whether the guard refuses the bound bytes, admitting them when absent. */
  refusesCall?: boolean
}) {
  const recorded: Recorded = structuredClone(NOTHING_RECORDED)
  const withdrawRepository = new MemoryRepository<Withdraw>()
  const vaultRequestRepository = new MemoryRepository<VaultRequest>()
  const ready = Promise.all([
    ...(options.withdraws ?? []).map((withdraw) => withdrawRepository.create(withdraw)),
    ...(options.requests ?? []).map((request) => vaultRequestRepository.create(request)),
  ])
  const service = new WithdrawServiceImpl(
    withdrawRepository,
    mock<WithdrawStateController>('WithdrawStateController', {
      startWithdraw: async (args) => {
        recorded.started.push(args)
        const { call: _call, ...withdraw } = args
        return withdrawFixture(withdraw)
      },
      completeWithdraw: async (args) => {
        recorded.completed.push(args)
        return withdrawFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
      },
    }),
    vaultRequestRepository,
    mock<UnitOfWork>('UnitOfWork', {
      runInTransaction: (work) => {
        recorded.transactions += 1
        return work()
      },
    }),
    SIGNET,
    VAULT,
    mock<SponsoredCallGuard>('SponsoredCallGuard', {
      assertSponsoredCall: (boundTx, circuit) => {
        expect(boundTx).toBe(BOUND_TX)
        recorded.guarded.push(circuit)
        if (options.refusesCall === true) throw new SponsoredCallMismatch(circuit)
      },
    }),
  )
  return { service, recorded, ready }
}

const ownWithdraw = (overrides: Partial<Withdraw>) =>
  withdrawFixture({
    name: `${caller.name}/ethereum-erc20-vault-withdraws/4c5d6e7f-8091-4a23-9b4c-5d6e7f8a9b0c`,
    ...overrides,
  })
const attestedUnder = (parent: string, overrides: Partial<VaultRequest> = {}) => ({
  ...VAULT_REQUEST_IN_STATE.Attested,
  name: `${caller.name}/ethereum-erc20-vault-requests/7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f`,
  parent,
  action: 'withdraw' as const,
  ...overrides,
})

describe('WithdrawServiceImpl.prepareStartWithdraw', () => {
  test('assigns a fresh slot on every call, and nothing is written', async () => {
    const { service, recorded } = serviceOver({})
    const first = await service.prepareStartWithdraw(caller, { withdrawRequest: REQUEST })
    const second = await service.prepareStartWithdraw(caller, { withdrawRequest: REQUEST })
    for (const { inIndex } of [first, second]) {
      expect(inIndex).toBeGreaterThanOrEqual(0n)
      expect(inIndex).toBeLessThanOrEqual(UINT64_MAX)
    }
    expect(first.inIndex).not.toBe(second.inIndex)
    expect(recorded).toEqual(NOTHING_RECORDED)
  })
})

describe('WithdrawServiceImpl.startWithdraw', () => {
  test('commits the bound start call under the vault account in one transaction', async () => {
    const { service, recorded } = serviceOver({})
    const withdraw = await service.startWithdraw(caller, {
      withdrawRequest: REQUEST,
      inIndex: 42n,
      boundTx: BOUND_TX,
    })
    expect(withdraw.name).toMatch(
      new RegExp(`^${caller.name}/ethereum-erc20-vault-withdraws/${UUID}$`),
    )
    expect(withdraw).toMatchObject({
      ...REQUEST,
      state: 'AwaitingStartTransaction',
      inIndex: 42n,
      vaultAccount: vaultAccountOf(SIGNET, VAULT),
      outcome: null,
      failure: null,
      error: null,
    })
    expect(recorded).toEqual({
      transactions: 1,
      guarded: ['startWithdraw'],
      started: [
        {
          name: withdraw.name,
          ...REQUEST,
          inIndex: 42n,
          vaultAccount: vaultAccountOf(SIGNET, VAULT),
          call: { boundTx: BOUND_TX },
        },
      ],
      completed: [],
    })
  })

  test('bound bytes the guard refuses are refused and nothing is written', async () => {
    const { service, recorded } = serviceOver({ refusesCall: true })
    const starting = service.startWithdraw(caller, {
      withdrawRequest: REQUEST,
      inIndex: 42n,
      boundTx: BOUND_TX,
    })
    await expect(starting).rejects.toBeInstanceOf(SponsoredCallMismatch)
    await expect(starting).rejects.toThrow(
      'the bound bytes must be exactly one startWithdraw call to the vault',
    )
    expect(recorded).toEqual({ ...NOTHING_RECORDED, guarded: ['startWithdraw'] })
  })
})

const awaiting = ownWithdraw({ state: 'AwaitingCompletion' })

interface Refusal {
  name: string
  by: Caller
  withdraws: Withdraw[]
  requests: VaultRequest[]
  expectError: string | typeof WithdrawStateConflict
}

/** What both completion methods refuse before anything is read from the request. */
const refusedCompletions: readonly Refusal[] = [
  {
    name: "another caller's withdrawal does not exist for this caller",
    by: stranger,
    withdraws: [awaiting],
    requests: [attestedUnder(awaiting.name)],
    expectError: 'does not exist',
  },
  {
    name: 'a withdrawal that was never started',
    by: caller,
    withdraws: [],
    requests: [],
    expectError: 'does not exist',
  },
  {
    name: 'a withdrawal still waiting for its request',
    by: caller,
    withdraws: [ownWithdraw({ state: 'AwaitingVaultRequest' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: WithdrawStateConflict,
  },
  {
    name: 'a withdrawal already completing',
    by: caller,
    withdraws: [ownWithdraw({ state: 'AwaitingCompleteTransaction' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: WithdrawStateConflict,
  },
]

/** What the request read refuses, which only the prepare method makes. */
const refusedPreparations: readonly Refusal[] = [
  {
    name: 'a withdrawal whose request holds no attestation',
    by: caller,
    withdraws: [awaiting],
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
    name: 'a withdrawal without a request row',
    by: caller,
    withdraws: [awaiting],
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

describe('WithdrawServiceImpl.prepareCompleteWithdraw', () => {
  const inputs: ReadonlyArray<{
    name: string
    request: VaultRequest
    expectKind: 'executed' | 'failed' | 'unviable'
    expectOutput: string
  }> = [
    {
      name: "an executed transfer's attested output",
      request: attestedUnder(awaiting.name),
      expectKind: 'executed',
      expectOutput: ATTESTATION_FIELDS.attestationOutput,
    },
    {
      name: 'a failed transfer, whose output is empty',
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
        withdraws: [awaiting],
        requests: [request],
      })
      await ready
      expect(await service.prepareCompleteWithdraw(caller, { name: awaiting.name })).toEqual({
        requestId: REQUEST_ID_HEX,
        attestationOutputKind: expectKind,
        attestationOutput: expectOutput,
      })
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )

  test.each([...refusedCompletions, ...refusedPreparations])(
    '$name: nothing is written',
    async ({ by, withdraws, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ withdraws, requests })
      await ready
      await expectRefusal(service.prepareCompleteWithdraw(by, { name: awaiting.name }), expectError)
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )
})

describe('WithdrawServiceImpl.completeWithdraw', () => {
  test('commits the bound call in one transaction after the state check', async () => {
    const { service, recorded, ready } = serviceOver({
      withdraws: [awaiting],
      requests: [attestedUnder(awaiting.name)],
    })
    await ready
    const withdraw = await service.completeWithdraw(caller, {
      name: awaiting.name,
      boundTx: BOUND_TX,
    })
    expect(withdraw.state).toBe('AwaitingCompleteTransaction')
    expect(recorded).toEqual({
      transactions: 1,
      guarded: ['completeWithdraw'],
      started: [],
      completed: [{ name: awaiting.name, call: { boundTx: BOUND_TX } }],
    })
  })

  test.each(refusedCompletions)(
    '$name: nothing is written',
    async ({ by, withdraws, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ withdraws, requests })
      await ready
      await expectRefusal(
        service.completeWithdraw(by, { name: awaiting.name, boundTx: BOUND_TX }),
        expectError,
      )
      expect(recorded).toEqual({ ...NOTHING_RECORDED, guarded: ['completeWithdraw'] })
    },
  )

  test('bound bytes the guard refuses are refused before the withdrawal is read and nothing is written', async () => {
    // No withdrawal is stored, so a refusal of the call shows the guard ran first.
    const { service, recorded } = serviceOver({ refusesCall: true })
    const completing = service.completeWithdraw(caller, {
      name: awaiting.name,
      boundTx: BOUND_TX,
    })
    await expect(completing).rejects.toBeInstanceOf(SponsoredCallMismatch)
    await expect(completing).rejects.toThrow(
      'the bound bytes must be exactly one completeWithdraw call to the vault',
    )
    expect(recorded).toEqual({ ...NOTHING_RECORDED, guarded: ['completeWithdraw'] })
  })
})

describe('WithdrawServiceImpl reads', () => {
  test("lists the caller's withdrawals newest first and gets only its own", async () => {
    const older = ownWithdraw({ createTime: new Date('2026-01-01T00:00:00Z') })
    const newer = ownWithdraw({
      name: `${caller.name}/ethereum-erc20-vault-withdraws/5c5d6e7f-8091-4a23-9b4c-5d6e7f8a9b0c`,
      createTime: new Date('2026-01-02T00:00:00Z'),
    })
    const theirs = withdrawFixture({
      name: `${stranger.name}/ethereum-erc20-vault-withdraws/6c5d6e7f-8091-4a23-9b4c-5d6e7f8a9b0c`,
    })
    const { service, ready } = serviceOver({ withdraws: [older, newer, theirs] })
    await ready
    expect(await service.listWithdraws(caller, {})).toEqual([newer, older])
    expect(await service.getWithdraw(caller, { name: theirs.name })).toBeUndefined()
    expect(await service.getWithdraw(stranger, { name: theirs.name })).toEqual(theirs)
  })
})
