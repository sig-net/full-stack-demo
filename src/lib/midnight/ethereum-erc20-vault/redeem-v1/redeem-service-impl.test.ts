import { hexToBytes } from '@sig-net/midnight'
import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { CALLER, STRANGER } from '@/lib/caller/caller-fixtures'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { Redeem } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import {
  redeemFixture,
  STATA_ERC20_ADDRESS,
  UNDERLYING_ERC20_ADDRESS,
  USER_COMMITMENT,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-fixtures'
import { RedeemServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-impl'
import {
  type CompleteRedeemArgs,
  RedeemStateConflict,
  type RedeemStateController,
  type StartRedeemArgs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-controller'
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

const caller: Caller = CALLER
const stranger: Caller = STRANGER
const REQUEST = { shares: 300_000n }
const ASSETS_OUTPUT = `40420f${'00'.repeat(29)}`
const FINALIZED_TX = 'f1a1'

/** What the service read, wrote, so a test can see that a refusal writes nothing and a commit opens one transaction. */
interface Recorded {
  steps: string[]
  started: StartRedeemArgs[]
  completed: CompleteRedeemArgs[]
}

const NOTHING_RECORDED: Recorded = { steps: [], started: [], completed: [] }

function serviceOver(options: {
  redeems?: Redeem[]
  requests?: VaultRequest[]
  initialised?: boolean
}) {
  const recorded: Recorded = structuredClone(NOTHING_RECORDED)
  const redeemRepository = new MemoryRepository<Redeem>()
  const vaultRequestRepository = new MemoryRepository<VaultRequest>()
  const ready = Promise.all([
    ...(options.redeems ?? []).map((redeem) => redeemRepository.create(redeem)),
    ...(options.requests ?? []).map((request) => vaultRequestRepository.create(request)),
  ])
  const service = new RedeemServiceImpl(
    redeemRepository,
    mock<RedeemStateController>('RedeemStateController', {
      startRedeem: async (args) => {
        recorded.started.push(args)
        const { call: _call, ...redeem } = args
        return redeemFixture(redeem)
      },
      completeRedeem: async (args) => {
        recorded.completed.push(args)
        return redeemFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
      },
    }),
    vaultRequestRepository,
    mock<SpenderLedger>('SpenderLedger', {
      state: async () => {
        recorded.steps.push('ledger')
        return {
          initialised: options.initialised ?? true,
          allowedTokens: ledgerSet([]),
          uniswapRouter: new Uint8Array(20),
          stataUnderlying: hexToBytes(UNDERLYING_ERC20_ADDRESS.slice(2)),
          stataToken: hexToBytes(STATA_ERC20_ADDRESS.slice(2)),
        }
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

const ownRedeem = (overrides: Partial<Redeem>) =>
  redeemFixture({
    name: `${caller.name}/ethereum-erc20-vault-redeems/6e7f8091-a2b3-4c4d-9e5f-7a8b9c0d1e2f`,
    ...overrides,
  })
const attestedUnder = (parent: string, overrides: Partial<VaultRequest> = {}) => ({
  ...VAULT_REQUEST_IN_STATE.Attested,
  name: `${caller.name}/ethereum-erc20-vault-requests/7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f`,
  parent,
  action: 'redeem' as const,
  attestationOutput: ASSETS_OUTPUT,
  ...overrides,
})

describe('RedeemServiceImpl.prepareStartRedeem', () => {
  test('reads the pinned wrapper and assigns a fresh slot on every call, and nothing is written', async () => {
    const { service, recorded } = serviceOver({})
    const first = await service.prepareStartRedeem(caller, { redeemRequest: REQUEST })
    const second = await service.prepareStartRedeem(caller, { redeemRequest: REQUEST })
    for (const inputs of [first, second]) {
      expect(inputs.stataErc20Address).toBe(STATA_ERC20_ADDRESS)
      expect(inputs.inIndex).toBeGreaterThanOrEqual(0n)
      expect(inputs.inIndex).toBeLessThanOrEqual(UINT64_MAX)
    }
    expect(first.inIndex).not.toBe(second.inIndex)
    expect(recorded).toEqual({ ...NOTHING_RECORDED, steps: ['ledger', 'ledger'] })
  })
})

describe('RedeemServiceImpl on an uninitialised vault', () => {
  test.each<{ name: string; call: (service: RedeemServiceImpl) => Promise<unknown> }>([
    {
      name: 'prepareStartRedeem refuses before assigning a slot',
      call: (service) => service.prepareStartRedeem(caller, { redeemRequest: REQUEST }),
    },
    {
      name: 'startRedeem refuses before committing a pair of zero addresses',
      call: (service) =>
        service.startRedeem(caller, {
          redeemRequest: REQUEST,
          userCommitment: USER_COMMITMENT,
          inIndex: 42n,
          finalizedTx: FINALIZED_TX,
        }),
    },
  ])('$name', async ({ call }) => {
    const { service, recorded } = serviceOver({ initialised: false })
    await expect(call(service)).rejects.toThrow(
      'The vault is not initialised: its deployer has not run initialise.',
    )
    expect(recorded).toEqual({ ...NOTHING_RECORDED, steps: ['ledger'] })
  })
})

describe('RedeemServiceImpl.startRedeem', () => {
  test('reads the pair again, then commits the finalised call under the vault account in one transaction', async () => {
    const { service, recorded } = serviceOver({})
    const redeem = await service.startRedeem(caller, {
      redeemRequest: REQUEST,
      userCommitment: USER_COMMITMENT,
      inIndex: 42n,
      finalizedTx: FINALIZED_TX,
    })
    expect(redeem.name).toMatch(new RegExp(`^${caller.name}/ethereum-erc20-vault-redeems/${UUID}$`))
    expect(redeem).toMatchObject({
      stataErc20Address: STATA_ERC20_ADDRESS,
      underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
      shares: REQUEST.shares,
      state: 'AwaitingStartTransaction',
      userCommitment: USER_COMMITMENT,
      inIndex: 42n,
      vaultAccount: vaultAccountOf(SIGNET, VAULT),
      outcome: null,
      failure: null,
      error: null,
    })
    expect(recorded).toEqual({
      steps: ['ledger', 'transaction'],
      started: [
        {
          name: redeem.name,
          stataErc20Address: STATA_ERC20_ADDRESS,
          underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
          shares: REQUEST.shares,
          userCommitment: USER_COMMITMENT,
          inIndex: 42n,
          vaultAccount: vaultAccountOf(SIGNET, VAULT),
          call: { finalizedTx: FINALIZED_TX },
        },
      ],
      completed: [],
    })
  })
})

const awaiting = ownRedeem({ state: 'AwaitingCompletion' })

interface Refusal {
  name: string
  by: Caller
  redeems: Redeem[]
  requests: VaultRequest[]
  expectError: string | typeof RedeemStateConflict
}

/** What both completion methods refuse before anything is read from the request. */
const refusedCompletions: readonly Refusal[] = [
  {
    name: "another caller's redeem does not exist for this caller",
    by: stranger,
    redeems: [awaiting],
    requests: [attestedUnder(awaiting.name)],
    expectError: 'does not exist',
  },
  {
    name: 'a redeem that was never started',
    by: caller,
    redeems: [],
    requests: [],
    expectError: 'does not exist',
  },
  {
    name: 'a redeem still waiting for its request',
    by: caller,
    redeems: [ownRedeem({ state: 'AwaitingVaultRequest' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: RedeemStateConflict,
  },
  {
    name: 'a redeem already completing',
    by: caller,
    redeems: [ownRedeem({ state: 'AwaitingCompleteTransaction' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: RedeemStateConflict,
  },
]

/** What the request read refuses, which only the prepare method makes. */
const refusedPreparations: readonly Refusal[] = [
  {
    name: 'a redeem whose request holds no attestation',
    by: caller,
    redeems: [awaiting],
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
    name: 'a redeem without a request row',
    by: caller,
    redeems: [awaiting],
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

describe('RedeemServiceImpl.prepareCompleteRedeem', () => {
  const inputs: ReadonlyArray<{
    name: string
    request: VaultRequest
    expectKind: 'executed' | 'failed' | 'unviable'
    expectOutput: string
  }> = [
    {
      name: "an executed redeem's attested assets",
      request: attestedUnder(awaiting.name),
      expectKind: 'executed',
      expectOutput: ASSETS_OUTPUT,
    },
    {
      name: 'a failed redeem, whose output is empty',
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
      const { service, recorded, ready } = serviceOver({ redeems: [awaiting], requests: [request] })
      await ready
      expect(await service.prepareCompleteRedeem(caller, { name: awaiting.name })).toEqual({
        requestId: REQUEST_ID_HEX,
        attestationOutputKind: expectKind,
        attestationOutput: expectOutput,
      })
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )

  test.each([...refusedCompletions, ...refusedPreparations])(
    '$name: nothing is written',
    async ({ by, redeems, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ redeems, requests })
      await ready
      await expectRefusal(service.prepareCompleteRedeem(by, { name: awaiting.name }), expectError)
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )
})

describe('RedeemServiceImpl.completeRedeem', () => {
  test('commits the finalised call in one transaction after the state check', async () => {
    const { service, recorded, ready } = serviceOver({
      redeems: [awaiting],
      requests: [attestedUnder(awaiting.name)],
    })
    await ready
    const redeem = await service.completeRedeem(caller, {
      name: awaiting.name,
      finalizedTx: FINALIZED_TX,
    })
    expect(redeem.state).toBe('AwaitingCompleteTransaction')
    expect(recorded).toEqual({
      steps: ['transaction'],
      started: [],
      completed: [{ name: awaiting.name, call: { finalizedTx: FINALIZED_TX } }],
    })
  })

  test.each(refusedCompletions)(
    '$name: nothing is written',
    async ({ by, redeems, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ redeems, requests })
      await ready
      await expectRefusal(
        service.completeRedeem(by, { name: awaiting.name, finalizedTx: FINALIZED_TX }),
        expectError,
      )
      expect(recorded).toEqual({
        ...NOTHING_RECORDED,
        steps: [],
      })
    },
  )
})

describe('RedeemServiceImpl reads', () => {
  test("lists the caller's redeems newest first and gets only its own", async () => {
    const older = ownRedeem({ createTime: new Date('2026-01-01T00:00:00Z') })
    const newer = ownRedeem({
      name: `${caller.name}/ethereum-erc20-vault-redeems/7e7f8091-a2b3-4c4d-9e5f-7a8b9c0d1e2f`,
      createTime: new Date('2026-01-02T00:00:00Z'),
    })
    const theirs = redeemFixture({
      name: `${stranger.name}/ethereum-erc20-vault-redeems/8e7f8091-a2b3-4c4d-9e5f-7a8b9c0d1e2f`,
    })
    const { service, ready } = serviceOver({ redeems: [older, newer, theirs] })
    await ready
    expect(await service.listRedeems(caller, {})).toEqual([newer, older])
    expect(await service.getRedeem(caller, { name: theirs.name })).toBeUndefined()
    expect(await service.getRedeem(stranger, { name: theirs.name })).toEqual(theirs)
  })
})
