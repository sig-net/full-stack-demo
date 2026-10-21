import { hexToBytes } from '@sig-net/midnight'
import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import type { Supply } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import {
  STATA_ERC20_ADDRESS,
  supplyFixture,
  UNDERLYING_ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-fixtures'
import { SupplyServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service-impl'
import {
  type CompleteSupplyArgs,
  type StartSupplyArgs,
  SupplyStateConflict,
  type SupplyStateController,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
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

const caller: Caller = resolveCaller('ab'.repeat(32))
const stranger: Caller = resolveCaller('cd'.repeat(32))
const REQUEST = { amount: 1_000_000n }
const SHARES_OUTPUT = `40420f${'00'.repeat(29)}`
const FINALIZED_TX = 'f1a1'

/** What the service read, wrote, in order, so a test can see that a refusal writes nothing and a commit opens one transaction after its reads. */
interface Recorded {
  steps: string[]
  started: StartSupplyArgs[]
  completed: CompleteSupplyArgs[]
  allowanceReads: string[][]
}

const NOTHING_RECORDED: Recorded = {
  steps: [],

  started: [],
  completed: [],
  allowanceReads: [],
}

function serviceOver(options: {
  supplies?: Supply[]
  requests?: VaultRequest[]
  allowance?: bigint
  initialised?: boolean
}) {
  const recorded: Recorded = structuredClone(NOTHING_RECORDED)
  const supplyRepository = new MemoryRepository<Supply>()
  const vaultRequestRepository = new MemoryRepository<VaultRequest>()
  const ready = Promise.all([
    ...(options.supplies ?? []).map((supply) => supplyRepository.create(supply)),
    ...(options.requests ?? []).map((request) => vaultRequestRepository.create(request)),
  ])
  const service = new SupplyServiceImpl(
    supplyRepository,
    mock<SupplyStateController>('SupplyStateController', {
      startSupply: async (args) => {
        recorded.started.push(args)
        const { call: _call, ...supply } = args
        return supplyFixture(supply)
      },
      completeSupply: async (args) => {
        recorded.completed.push(args)
        return supplyFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
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
    mock<Erc20Reader>('Erc20Reader', {
      allowance: async (erc20Address, owner, spender) => {
        recorded.allowanceReads.push([erc20Address, owner, spender])
        return options.allowance ?? 0n
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

const ownSupply = (overrides: Partial<Supply>) =>
  supplyFixture({
    name: `${caller.name}/ethereum-erc20-vault-supplies/5d6e7f80-91a2-4b3c-8d4e-6f7a8b9c0d1e`,
    ...overrides,
  })
const attestedUnder = (parent: string, overrides: Partial<VaultRequest> = {}) => ({
  ...VAULT_REQUEST_IN_STATE.Attested,
  name: `${caller.name}/ethereum-erc20-vault-requests/7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f`,
  parent,
  action: 'supply' as const,
  attestationOutput: SHARES_OUTPUT,
  ...overrides,
})

describe('SupplyServiceImpl.getSupplyTarget', () => {
  test("reads the pinned pair from the ledger and the wrapper's allowance from the chain", async () => {
    const { service, recorded } = serviceOver({ allowance: 7n })
    expect(await service.getSupplyTarget(caller, {})).toEqual({
      underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
      stataErc20Address: STATA_ERC20_ADDRESS,
      allowance: 7n,
    })
    expect(recorded.allowanceReads).toEqual([
      [UNDERLYING_ERC20_ADDRESS, vaultAccountOf(SIGNET, VAULT), STATA_ERC20_ADDRESS],
    ])
  })
})

describe('SupplyServiceImpl on an uninitialised vault', () => {
  test.each<{ name: string; call: (service: SupplyServiceImpl) => Promise<unknown> }>([
    {
      name: 'getSupplyTarget refuses before reading an allowance at a zero address',
      call: (service) => service.getSupplyTarget(caller, {}),
    },
    {
      name: 'prepareStartSupply refuses before assigning a slot',
      call: (service) => service.prepareStartSupply(caller, { supplyRequest: REQUEST }),
    },
    {
      name: 'startSupply refuses before committing a pair of zero addresses',
      call: (service) =>
        service.startSupply(caller, {
          supplyRequest: REQUEST,
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

describe('SupplyServiceImpl.prepareStartSupply', () => {
  test('assigns a fresh slot on every call beside the pinned underlying, and nothing is written', async () => {
    const { service, recorded } = serviceOver({})
    const first = await service.prepareStartSupply(caller, { supplyRequest: REQUEST })
    const second = await service.prepareStartSupply(caller, { supplyRequest: REQUEST })
    for (const inputs of [first, second]) {
      expect(inputs.underlyingErc20Address).toBe(UNDERLYING_ERC20_ADDRESS)
      expect(inputs.inIndex).toBeGreaterThanOrEqual(0n)
      expect(inputs.inIndex).toBeLessThanOrEqual(UINT64_MAX)
    }
    expect(first.inIndex).not.toBe(second.inIndex)
    expect(recorded).toEqual({ ...NOTHING_RECORDED, steps: ['ledger', 'ledger'] })
  })
})

describe('SupplyServiceImpl.startSupply', () => {
  test('reads the pair again and commits the finalised call under the vault account in one transaction', async () => {
    const { service, recorded } = serviceOver({})
    const supply = await service.startSupply(caller, {
      supplyRequest: REQUEST,
      inIndex: 42n,
      finalizedTx: FINALIZED_TX,
    })
    expect(supply.name).toMatch(
      new RegExp(`^${caller.name}/ethereum-erc20-vault-supplies/${UUID}$`),
    )
    expect(supply).toMatchObject({
      underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
      stataErc20Address: STATA_ERC20_ADDRESS,
      amount: REQUEST.amount,
      state: 'AwaitingStartTransaction',
      inIndex: 42n,
      vaultAccount: vaultAccountOf(SIGNET, VAULT),
      outcome: null,
      failure: null,
      error: null,
    })
    expect(recorded).toEqual({
      ...NOTHING_RECORDED,
      steps: ['ledger', 'transaction'],
      started: [
        {
          name: supply.name,
          underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
          stataErc20Address: STATA_ERC20_ADDRESS,
          amount: REQUEST.amount,
          inIndex: 42n,
          vaultAccount: vaultAccountOf(SIGNET, VAULT),
          call: { finalizedTx: FINALIZED_TX },
        },
      ],
    })
  })
})

const awaiting = ownSupply({ state: 'AwaitingCompletion' })

interface Refusal {
  name: string
  by: Caller
  supplies: Supply[]
  requests: VaultRequest[]
  expectError: string | typeof SupplyStateConflict
}

/** What both completion methods refuse before anything is read from the request. */
const refusedCompletions: readonly Refusal[] = [
  {
    name: "another caller's supply does not exist for this caller",
    by: stranger,
    supplies: [awaiting],
    requests: [attestedUnder(awaiting.name)],
    expectError: 'does not exist',
  },
  {
    name: 'a supply that was never started',
    by: caller,
    supplies: [],
    requests: [],
    expectError: 'does not exist',
  },
  {
    name: 'a supply still waiting for its request',
    by: caller,
    supplies: [ownSupply({ state: 'AwaitingVaultRequest' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: SupplyStateConflict,
  },
  {
    name: 'a supply already completing',
    by: caller,
    supplies: [ownSupply({ state: 'AwaitingCompleteTransaction' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: SupplyStateConflict,
  },
]

/** What the request read refuses, which only the prepare method makes. */
const refusedPreparations: readonly Refusal[] = [
  {
    name: 'a supply whose request holds no attestation',
    by: caller,
    supplies: [awaiting],
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
    name: 'a supply without a request row',
    by: caller,
    supplies: [awaiting],
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

describe('SupplyServiceImpl.prepareCompleteSupply', () => {
  const inputs: ReadonlyArray<{
    name: string
    request: VaultRequest
    expectKind: 'executed' | 'failed' | 'unviable'
    expectOutput: string
  }> = [
    {
      name: "an executed deposit's attested shares",
      request: attestedUnder(awaiting.name),
      expectKind: 'executed',
      expectOutput: SHARES_OUTPUT,
    },
    {
      name: 'a failed deposit, whose output is empty',
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
        supplies: [awaiting],
        requests: [request],
      })
      await ready
      expect(await service.prepareCompleteSupply(caller, { name: awaiting.name })).toEqual({
        requestId: REQUEST_ID_HEX,
        attestationOutputKind: expectKind,
        attestationOutput: expectOutput,
      })
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )

  test.each([...refusedCompletions, ...refusedPreparations])(
    '$name: nothing is written',
    async ({ by, supplies, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ supplies, requests })
      await ready
      await expectRefusal(service.prepareCompleteSupply(by, { name: awaiting.name }), expectError)
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )
})

describe('SupplyServiceImpl.completeSupply', () => {
  test('commits the finalised call in one transaction after the state check', async () => {
    const { service, recorded, ready } = serviceOver({
      supplies: [awaiting],
      requests: [attestedUnder(awaiting.name)],
    })
    await ready
    const supply = await service.completeSupply(caller, {
      name: awaiting.name,
      finalizedTx: FINALIZED_TX,
    })
    expect(supply.state).toBe('AwaitingCompleteTransaction')
    expect(recorded).toEqual({
      ...NOTHING_RECORDED,
      steps: ['transaction'],
      completed: [{ name: awaiting.name, call: { finalizedTx: FINALIZED_TX } }],
    })
  })

  test.each(refusedCompletions)(
    '$name: nothing is written',
    async ({ by, supplies, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ supplies, requests })
      await ready
      await expectRefusal(
        service.completeSupply(by, { name: awaiting.name, finalizedTx: FINALIZED_TX }),
        expectError,
      )
      expect(recorded).toEqual({
        ...NOTHING_RECORDED,
        steps: [],
      })
    },
  )
})

describe('SupplyServiceImpl reads', () => {
  test("lists the caller's supplies newest first and gets only its own", async () => {
    const older = ownSupply({ createTime: new Date('2026-01-01T00:00:00Z') })
    const newer = ownSupply({
      name: `${caller.name}/ethereum-erc20-vault-supplies/6d6e7f80-91a2-4b3c-8d4e-6f7a8b9c0d1e`,
      createTime: new Date('2026-01-02T00:00:00Z'),
    })
    const theirs = supplyFixture({
      name: `${stranger.name}/ethereum-erc20-vault-supplies/7d6e7f80-91a2-4b3c-8d4e-6f7a8b9c0d1e`,
    })
    const { service, ready } = serviceOver({ supplies: [older, newer, theirs] })
    await ready
    expect(await service.listSupplies(caller, {})).toEqual([newer, older])
    expect(await service.getSupply(caller, { name: theirs.name })).toBeUndefined()
    expect(await service.getSupply(stranger, { name: theirs.name })).toEqual(theirs)
  })
})
