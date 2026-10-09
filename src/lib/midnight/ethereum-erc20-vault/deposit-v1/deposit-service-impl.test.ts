import { bytesToHex, deriveEvmAddress } from '@sig-net/midnight'
import { pureCircuits } from '@sig-net/midnight-examples-erc20-vault-contract'
import { type Provider, SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  depositFixture,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import { DepositServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-impl'
import {
  DepositStateConflict,
  type DepositStateController,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type {
  CompleteDepositCircuitArgs,
  StartDepositCircuitArgs,
  VaultCircuits,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  REQUEST_ID,
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
/** The account the MPC signs the caller's sweeps from, as the service must derive it. */
const CALLER_ACCOUNT = deriveEvmAddress(
  SIGNET.mpcRootPublicKey,
  VAULT.contractAddress,
  bytesToHex(pureCircuits.userCommitment(caller.secretKey)),
).toLowerCase()
const OTHER_ACCOUNT = `0x${'99'.repeat(20)}`
const WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const GAS = {
  gasLimit: 100_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
}

/** What the service did, in order, so a test can see the build precede the transaction. */
interface Recorded {
  steps: string[]
  startBuilds: StartDepositCircuitArgs[]
  completeBuilds: CompleteDepositCircuitArgs[]
  started: { deposit: Deposit; unprovenTx: string }[]
  completed: { name: string; unprovenTx: string }[]
}

function serviceOver(options: {
  deposits?: Deposit[]
  requests?: VaultRequest[]
  pendingCount?: number
}) {
  const recorded: Recorded = {
    steps: [],
    startBuilds: [],
    completeBuilds: [],
    started: [],
    completed: [],
  }
  const depositRepository = new MemoryRepository<Deposit>()
  const vaultRequestRepository = new MemoryRepository<VaultRequest>()
  const ready = Promise.all([
    ...(options.deposits ?? []).map((deposit) => depositRepository.create(deposit)),
    ...(options.requests ?? []).map((request) => vaultRequestRepository.create(request)),
  ])
  const service = new DepositServiceImpl(
    depositRepository,
    mock<DepositStateController>('DepositStateController', {
      startDeposit: async (args) => {
        recorded.started.push(args)
        return args.deposit
      },
      completeDeposit: async (args) => {
        recorded.completed.push(args)
        return depositFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
      },
    }),
    vaultRequestRepository,
    mock<VaultCircuits>('VaultCircuits', {
      startDeposit: async (args) => {
        recorded.steps.push('build')
        recorded.startBuilds.push(args)
        return 'start-call'
      },
      completeDeposit: async (args) => {
        recorded.steps.push('build')
        recorded.completeBuilds.push(args)
        return 'complete-call'
      },
    }),
    mock<Provider>('Provider', {
      getTransactionCount: async (address, blockTag) => {
        expect(address).toBe(CALLER_ACCOUNT)
        expect(blockTag).toBe('pending')
        return options.pendingCount ?? 0
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

const ownDeposit = (overrides: Partial<Deposit>) =>
  depositFixture({
    name: `${caller.name}/ethereum-erc20-vault-deposits/1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`,
    depositAccount: CALLER_ACCOUNT,
    ...overrides,
  })
const attestedUnder = (parent: string, overrides: Partial<VaultRequest> = {}) => ({
  ...VAULT_REQUEST_IN_STATE.Attested,
  name: `${caller.name}/ethereum-erc20-vault-requests/7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f`,
  parent,
  ...overrides,
})

describe('DepositServiceImpl.startDeposit', () => {
  const cases: ReadonlyArray<{
    name: string
    pendingCount: number
    deposits: Deposit[]
    expectNonce: bigint
  }> = [
    {
      name: "no live deposit: the chain's pending count",
      pendingCount: 3,
      deposits: [],
      expectNonce: 3n,
    },
    {
      name: 'a live deposit above the chain: one above its nonce',
      pendingCount: 3,
      deposits: [ownDeposit({ state: 'AwaitingVaultRequest', evmNonce: 5n })],
      expectNonce: 6n,
    },
    {
      name: 'a live deposit below the chain: the pending count',
      pendingCount: 9,
      deposits: [ownDeposit({ state: 'AwaitingCompletion', evmNonce: 5n })],
      expectNonce: 9n,
    },
    {
      name: 'terminal deposits reserve nothing',
      pendingCount: 3,
      deposits: [
        ownDeposit({ state: 'Completed', evmNonce: 9n, outcome: 'minted' }),
        ownDeposit({
          name: `${caller.name}/ethereum-erc20-vault-deposits/2f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`,
          state: 'Failed',
          evmNonce: 8n,
          failure: 'StartFailed',
        }),
      ],
      expectNonce: 3n,
    },
    {
      name: "another account's live deposits do not count",
      pendingCount: 3,
      deposits: [
        ownDeposit({ state: 'AwaitingVaultRequest', evmNonce: 9n, depositAccount: OTHER_ACCOUNT }),
      ],
      expectNonce: 3n,
    },
  ]

  test.each(cases)('$name', async ({ pendingCount, deposits, expectNonce }) => {
    const { service, recorded, ready } = serviceOver({ pendingCount, deposits })
    await ready
    const deposit = await service.startDeposit(caller, {
      depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1_000_000n },
      wallet: WALLET,
    })
    expect(recorded.steps).toEqual(['build', 'transaction'])
    expect(deposit.name).toMatch(
      new RegExp(`^${caller.name}/ethereum-erc20-vault-deposits/${UUID}$`),
    )
    expect(deposit).toMatchObject({
      erc20Address: ERC20_ADDRESS,
      amount: 1_000_000n,
      state: 'AwaitingStartTransaction',
      evmNonce: expectNonce,
      ...GAS,
      depositAccount: CALLER_ACCOUNT,
      outcome: null,
      failure: null,
      error: null,
    })
    expect(deposit.inIndex).toBeGreaterThanOrEqual(0n)
    expect(deposit.inIndex).toBeLessThanOrEqual(UINT64_MAX)
    expect(recorded.started).toEqual([{ deposit, unprovenTx: 'start-call' }])
    expect(recorded.startBuilds).toEqual([
      {
        secretKey: caller.secretKey,
        wallet: WALLET,
        inIndex: deposit.inIndex,
        evmNonce: expectNonce,
        gas: GAS,
        erc20Address: ERC20_ADDRESS,
        amount: 1_000_000n,
      },
    ])
  })

  test('each start draws a fresh input index', async () => {
    const { service, ready } = serviceOver({})
    await ready
    const request = { erc20Address: ERC20_ADDRESS, amount: 1n }
    const first = await service.startDeposit(caller, { depositRequest: request, wallet: WALLET })
    const second = await service.startDeposit(caller, { depositRequest: request, wallet: WALLET })
    expect(first.inIndex).not.toBe(second.inIndex)
  })
})

describe('DepositServiceImpl.completeDeposit', () => {
  const awaiting = ownDeposit({ state: 'AwaitingCompletion' })

  const built: ReadonlyArray<{
    name: string
    request: VaultRequest
    expectOutput: Uint8Array
  }> = [
    {
      name: "an executed sweep's attested output",
      request: attestedUnder(awaiting.name),
      expectOutput: new Uint8Array([1]),
    },
    {
      name: 'one zero byte for a failed sweep',
      request: attestedUnder(awaiting.name, {
        attestationOutputKind: 'failed',
        attestationOutput: '',
      }),
      expectOutput: new Uint8Array([0]),
    },
    {
      name: 'one zero byte for an unviable sweep',
      request: attestedUnder(awaiting.name, {
        attestationOutputKind: 'unviable',
        attestationOutput: '',
      }),
      expectOutput: new Uint8Array([0]),
    },
  ]

  test.each(built)('builds the complete call with %s', async ({ request, expectOutput }) => {
    const { service, recorded, ready } = serviceOver({ deposits: [awaiting], requests: [request] })
    await ready
    const deposit = await service.completeDeposit(caller, { name: awaiting.name, wallet: WALLET })
    expect(deposit.state).toBe('AwaitingCompleteTransaction')
    expect(recorded.steps).toEqual(['build', 'transaction'])
    expect(recorded.completed).toEqual([{ name: awaiting.name, unprovenTx: 'complete-call' }])
    expect(recorded.completeBuilds).toHaveLength(1)
    const [build] = recorded.completeBuilds
    expect(build).toMatchObject({
      secretKey: caller.secretKey,
      wallet: WALLET,
      requestId: REQUEST_ID,
      serializedOutput: expectOutput,
    })
    expect(build?.mintNonce).toHaveLength(32)
  })

  test('each completion draws a fresh mint nonce', async () => {
    const { service, recorded, ready } = serviceOver({
      deposits: [awaiting],
      requests: [attestedUnder(awaiting.name)],
    })
    await ready
    await service.completeDeposit(caller, { name: awaiting.name, wallet: WALLET })
    await service.completeDeposit(caller, { name: awaiting.name, wallet: WALLET })
    const [first, second] = recorded.completeBuilds
    expect(first?.mintNonce).not.toEqual(second?.mintNonce)
  })

  const refused: ReadonlyArray<{
    name: string
    by: Caller
    deposits: Deposit[]
    requests: VaultRequest[]
    expectError: string | typeof DepositStateConflict
  }> = [
    {
      name: "another caller's deposit does not exist for this caller",
      by: stranger,
      deposits: [awaiting],
      requests: [attestedUnder(awaiting.name)],
      expectError: 'does not exist',
    },
    {
      name: 'a deposit that was never started',
      by: caller,
      deposits: [],
      requests: [],
      expectError: 'does not exist',
    },
    {
      name: 'a deposit still waiting for its request',
      by: caller,
      deposits: [ownDeposit({ state: 'AwaitingVaultRequest' })],
      requests: [attestedUnder(awaiting.name)],
      expectError: DepositStateConflict,
    },
    {
      name: 'a deposit whose request is not attested',
      by: caller,
      deposits: [awaiting],
      requests: [attestedUnder(awaiting.name, VAULT_REQUEST_IN_STATE.AwaitingAttestationFlush)],
      expectError: 'has no attested vault request',
    },
    {
      name: 'a deposit without a request row',
      by: caller,
      deposits: [awaiting],
      requests: [],
      expectError: 'has no attested vault request',
    },
  ]

  test.each(refused)(
    '$name: nothing is built or written',
    async ({ by, deposits, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ deposits, requests })
      await ready
      const completing = service.completeDeposit(by, { name: awaiting.name, wallet: WALLET })
      if (typeof expectError === 'string') await expect(completing).rejects.toThrow(expectError)
      else await expect(completing).rejects.toBeInstanceOf(expectError)
      expect(recorded.steps).toEqual([])
    },
  )
})

describe('DepositServiceImpl reads', () => {
  const mine = [
    ownDeposit({ createTime: new Date('2026-01-01T00:00:00Z') }),
    ownDeposit({
      name: `${caller.name}/ethereum-erc20-vault-deposits/2f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`,
      state: 'AwaitingCompletion',
      createTime: new Date('2026-01-02T00:00:00Z'),
    }),
  ]
  const theirs = ownDeposit({
    name: `${stranger.name}/ethereum-erc20-vault-deposits/3f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`,
    depositAccount: OTHER_ACCOUNT,
  })

  test('getDeposit answers only for the owner', async () => {
    const { service, ready } = serviceOver({ deposits: [...mine, theirs] })
    await ready
    expect(await service.getDeposit(caller, { name: mine[0]?.name ?? '' })).toEqual(mine[0])
    expect(await service.getDeposit(caller, { name: theirs.name })).toBeUndefined()
    expect(await service.getDeposit(stranger, { name: mine[0]?.name ?? '' })).toBeUndefined()
  })

  test("listDeposits lists the caller's deposits newest first", async () => {
    const { service, ready } = serviceOver({ deposits: [...mine, theirs] })
    await ready
    expect(await service.listDeposits(caller, {})).toEqual([mine[1], mine[0]])
  })
})
