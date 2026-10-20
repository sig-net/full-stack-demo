import { bytesToHex, deriveEvmAddress } from '@sig-net/midnight'
import { pureCircuits, type VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'
import { type Provider, SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import { MIDNIGHT_NETWORK_DEFAULTS } from '@/lib/config/midnight-network-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  depositFixture,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import {
  DepositCallMismatch,
  DepositNonceConflict,
  DepositRecipientMismatch,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import { DepositServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-impl'
import {
  type CompleteDepositArgs,
  DepositStateConflict,
  type DepositStateController,
  type StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID_HEX,
  VAULT_REQUEST_IN_STATE,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { BoundContractAction } from '@/lib/midnight/transaction-v1/inspect-bound-transaction'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'
import { shieldedAddressOf } from '@/lib/midnight/wallet/shielded-address'
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
const WALLET: WalletPublicKeys = {
  coinPublicKey: 'aa'.repeat(32),
  encryptionPublicKey: 'bb'.repeat(32),
}
const OTHER_WALLET: WalletPublicKeys = {
  coinPublicKey: 'cc'.repeat(32),
  encryptionPublicKey: 'dd'.repeat(32),
}
const NETWORK = MIDNIGHT_NETWORK_DEFAULTS.undeployed
const GAS = {
  gasLimit: 100_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
}
const DEPOSIT_REQUEST = { erc20Address: ERC20_ADDRESS, amount: 1_000_000n }
const BOUND_TX = 'b0bd'

/** The one action bound bytes hold when they are the vault call the action commits. */
const vaultCall = (circuit: VaultCircuitId): BoundContractAction => ({
  kind: 'call',
  address: VAULT.contractAddress,
  entryPoint: circuit,
})

/** Bound bytes the service refuses for the circuit it commits, before anything is read. */
const mismatchedCalls = (
  circuit: VaultCircuitId,
  otherCircuit: VaultCircuitId,
): ReadonlyArray<{
  name: string
  actions: BoundContractAction[] | undefined
  spendsCoins?: boolean
}> => [
  { name: 'bytes that are not a bound transaction', actions: undefined },
  { name: 'a transaction with no contract action', actions: [] },
  { name: 'two vault calls', actions: [vaultCall(circuit), vaultCall(circuit)] },
  { name: 'a vault call that also spends coins', actions: [vaultCall(circuit)], spendsCoins: true },
  {
    name: 'a call to another contract',
    actions: [{ kind: 'call', address: '44'.repeat(32), entryPoint: circuit }],
  },
  { name: 'a call to another vault circuit', actions: [vaultCall(otherCircuit)] },
  { name: 'a deploy', actions: [{ kind: 'deploy', address: VAULT.contractAddress }] },
  {
    name: 'a maintenance update',
    actions: [{ kind: 'maintenance-update', address: VAULT.contractAddress }],
  },
]

/** What the service wrote, so a test can see that a refusal writes nothing and a commit opens one transaction. */
interface Recorded {
  transactions: number
  started: StartDepositArgs[]
  completed: CompleteDepositArgs[]
}

function serviceOver(options: {
  deposits?: Deposit[]
  requests?: VaultRequest[]
  pendingCount?: number
  /** What the bound bytes hold, a start call to the vault when absent. */
  actions?: BoundContractAction[] | undefined
  /** Whether the bound bytes spend coins beside their actions, false when absent. */
  spendsCoins?: boolean
}) {
  const recorded: Recorded = { transactions: 0, started: [], completed: [] }
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
        const { call: _call, ...deposit } = args
        return depositFixture(deposit)
      },
      completeDeposit: async (args) => {
        recorded.completed.push(args)
        return depositFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
      },
    }),
    vaultRequestRepository,
    mock<Provider>('Provider', {
      getTransactionCount: async (address, blockTag) => {
        expect(address).toBe(CALLER_ACCOUNT)
        expect(blockTag).toBe('pending')
        return options.pendingCount ?? 0
      },
    }),
    mock<UnitOfWork>('UnitOfWork', {
      runInTransaction: (work) => {
        recorded.transactions += 1
        return work()
      },
    }),
    SIGNET,
    VAULT,
    NETWORK,
    (boundTx) => {
      expect(boundTx).toBe(BOUND_TX)
      const actions = 'actions' in options ? options.actions : [vaultCall('startDeposit')]
      return actions === undefined
        ? undefined
        : { actions, spendsCoins: options.spendsCoins ?? false }
    },
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

/** The nonce the service assigns over the chain's pending count and the caller's live deposits. */
const assignments: ReadonlyArray<{
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

describe('DepositServiceImpl.prepareStartDeposit', () => {
  test.each(assignments)(
    '$name, and nothing is written',
    async ({ pendingCount, deposits, expectNonce }) => {
      const { service, recorded, ready } = serviceOver({ pendingCount, deposits })
      await ready
      const inputs = await service.prepareStartDeposit(caller, {
        depositRequest: DEPOSIT_REQUEST,
        wallet: WALLET,
      })
      expect(inputs).toEqual({ inIndex: inputs.inIndex, evmNonce: expectNonce, ...GAS })
      expect(inputs.inIndex).toBeGreaterThanOrEqual(0n)
      expect(inputs.inIndex).toBeLessThanOrEqual(UINT64_MAX)
      expect(recorded).toEqual({ transactions: 0, started: [], completed: [] })
    },
  )

  test('each call draws a fresh input index', async () => {
    const { service, ready } = serviceOver({})
    await ready
    const args = { depositRequest: DEPOSIT_REQUEST, wallet: WALLET }
    const first = await service.prepareStartDeposit(caller, args)
    const second = await service.prepareStartDeposit(caller, args)
    expect(first.inIndex).not.toBe(second.inIndex)
  })
})

describe('DepositServiceImpl.startDeposit', () => {
  test.each(assignments)(
    'the assigned nonce ($name) commits the bound call in one transaction',
    async ({ pendingCount, deposits, expectNonce }) => {
      const { service, recorded, ready } = serviceOver({ pendingCount, deposits })
      await ready
      const deposit = await service.startDeposit(caller, {
        depositRequest: DEPOSIT_REQUEST,
        wallet: WALLET,
        inIndex: 42n,
        evmNonce: expectNonce,
        boundTx: BOUND_TX,
      })
      expect(deposit.name).toMatch(
        new RegExp(`^${caller.name}/ethereum-erc20-vault-deposits/${UUID}$`),
      )
      expect(deposit).toMatchObject({
        erc20Address: ERC20_ADDRESS,
        amount: 1_000_000n,
        state: 'AwaitingStartTransaction',
        inIndex: 42n,
        evmNonce: expectNonce,
        ...GAS,
        depositAccount: CALLER_ACCOUNT,
        recipient: shieldedAddressOf(WALLET, NETWORK.networkId),
        outcome: null,
        failure: null,
        error: null,
      })
      expect(recorded.transactions).toBe(1)
      expect(recorded.started).toEqual([
        {
          name: deposit.name,
          erc20Address: ERC20_ADDRESS,
          amount: 1_000_000n,
          inIndex: 42n,
          evmNonce: expectNonce,
          ...GAS,
          depositAccount: CALLER_ACCOUNT,
          recipient: shieldedAddressOf(WALLET, NETWORK.networkId),
          call: { boundTx: BOUND_TX },
        },
      ])
    },
  )

  const stale: ReadonlyArray<{
    name: string
    pendingCount: number
    deposits: Deposit[]
    evmNonce: bigint
  }> = [
    { name: 'a nonce below the assignment', pendingCount: 3, deposits: [], evmNonce: 2n },
    { name: 'a nonce above the assignment', pendingCount: 3, deposits: [], evmNonce: 4n },
    {
      name: 'the nonce a deposit started since the assignment took',
      pendingCount: 3,
      deposits: [ownDeposit({ state: 'AwaitingStartTransaction', evmNonce: 3n })],
      evmNonce: 3n,
    },
    {
      name: 'a nonce the chain moved past since the assignment',
      pendingCount: 4,
      deposits: [],
      evmNonce: 3n,
    },
  ]

  test.each(stale)(
    '$name is refused and nothing is written',
    async ({ pendingCount, deposits, evmNonce }) => {
      const { service, recorded, ready } = serviceOver({ pendingCount, deposits })
      await ready
      const starting = service.startDeposit(caller, {
        depositRequest: DEPOSIT_REQUEST,
        wallet: WALLET,
        inIndex: 42n,
        evmNonce,
        boundTx: BOUND_TX,
      })
      await expect(starting).rejects.toBeInstanceOf(DepositNonceConflict)
      await expect(starting).rejects.toThrow(CALLER_ACCOUNT)
      expect(recorded).toEqual({ transactions: 0, started: [], completed: [] })
    },
  )

  test.each(mismatchedCalls('startDeposit', 'completeDeposit'))(
    '$name is refused before the nonce check and nothing is written',
    async ({ actions, spendsCoins }) => {
      const { service, recorded, ready } = serviceOver({ actions, spendsCoins })
      await ready
      const starting = service.startDeposit(caller, {
        depositRequest: DEPOSIT_REQUEST,
        wallet: WALLET,
        inIndex: 42n,
        // A stale nonce, so a refusal of the call shows the check ran first.
        evmNonce: 7n,
        boundTx: BOUND_TX,
      })
      await expect(starting).rejects.toBeInstanceOf(DepositCallMismatch)
      await expect(starting).rejects.toThrow(
        'the bound bytes must be exactly one startDeposit call to the vault',
      )
      expect(recorded).toEqual({ transactions: 0, started: [], completed: [] })
    },
  )
})

const awaiting = ownDeposit({ state: 'AwaitingCompletion' })

interface Refusal {
  name: string
  by: Caller
  deposits: Deposit[]
  requests: VaultRequest[]
  wallet: WalletPublicKeys
  expectError: string | typeof DepositStateConflict | typeof DepositRecipientMismatch
}

/** What both completion methods refuse before anything is read from the request. */
const refusedCompletions: readonly Refusal[] = [
  {
    name: "another caller's deposit does not exist for this caller",
    by: stranger,
    deposits: [awaiting],
    requests: [attestedUnder(awaiting.name)],
    wallet: WALLET,
    expectError: 'does not exist',
  },
  {
    name: 'a deposit that was never started',
    by: caller,
    deposits: [],
    requests: [],
    wallet: WALLET,
    expectError: 'does not exist',
  },
  {
    name: 'a deposit still waiting for its request',
    by: caller,
    deposits: [ownDeposit({ state: 'AwaitingVaultRequest' })],
    requests: [attestedUnder(awaiting.name)],
    wallet: WALLET,
    expectError: DepositStateConflict,
  },
  {
    name: 'a deposit already completing',
    by: caller,
    deposits: [ownDeposit({ state: 'AwaitingCompleteTransaction' })],
    requests: [attestedUnder(awaiting.name)],
    wallet: WALLET,
    expectError: DepositStateConflict,
  },
  {
    name: 'a wallet other than the one the deposit mints to',
    by: caller,
    deposits: [awaiting],
    requests: [attestedUnder(awaiting.name)],
    wallet: OTHER_WALLET,
    expectError: DepositRecipientMismatch,
  },
]

/** What the request read refuses, which only the prepare method makes. */
const refusedPreparations: readonly Refusal[] = [
  {
    name: 'a deposit whose request holds no attestation',
    by: caller,
    deposits: [awaiting],
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
    wallet: WALLET,
    expectError: 'holds no attestation',
  },
  {
    name: 'a deposit without a request row',
    by: caller,
    deposits: [awaiting],
    requests: [],
    wallet: WALLET,
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

describe('DepositServiceImpl.prepareCompleteDeposit', () => {
  const inputs: ReadonlyArray<{
    name: string
    request: VaultRequest
    expectKind: 'executed' | 'failed' | 'unviable'
    expectOutput: string
  }> = [
    {
      name: "an executed sweep's attested output",
      request: attestedUnder(awaiting.name),
      expectKind: 'executed',
      expectOutput: ATTESTATION_FIELDS.attestationOutput,
    },
    {
      name: 'a failed sweep, whose output is empty',
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
        deposits: [awaiting],
        requests: [request],
      })
      await ready
      expect(
        await service.prepareCompleteDeposit(caller, { name: awaiting.name, wallet: WALLET }),
      ).toEqual({
        requestId: REQUEST_ID_HEX,
        attestationOutputKind: expectKind,
        attestationOutput: expectOutput,
      })
      expect(recorded).toEqual({ transactions: 0, started: [], completed: [] })
    },
  )

  test('the deposit of a row stored without a recipient is prepared for any wallet', async () => {
    const { service, ready } = serviceOver({
      deposits: [ownDeposit({ state: 'AwaitingCompletion', recipient: null })],
      requests: [attestedUnder(awaiting.name)],
    })
    await ready
    const prepared = await service.prepareCompleteDeposit(caller, {
      name: awaiting.name,
      wallet: OTHER_WALLET,
    })
    expect(prepared.requestId).toBe(REQUEST_ID_HEX)
  })

  test.each([...refusedCompletions, ...refusedPreparations])(
    '$name: nothing is written',
    async ({ by, deposits, requests, wallet, expectError }) => {
      const { service, recorded, ready } = serviceOver({ deposits, requests })
      await ready
      await expectRefusal(
        service.prepareCompleteDeposit(by, { name: awaiting.name, wallet }),
        expectError,
      )
      expect(recorded).toEqual({ transactions: 0, started: [], completed: [] })
    },
  )
})

describe('DepositServiceImpl.completeDeposit', () => {
  test('commits the bound call in one transaction after the checks', async () => {
    const { service, recorded, ready } = serviceOver({
      deposits: [awaiting],
      requests: [attestedUnder(awaiting.name)],
      actions: [vaultCall('completeDeposit')],
    })
    await ready
    const deposit = await service.completeDeposit(caller, {
      name: awaiting.name,
      wallet: WALLET,
      boundTx: BOUND_TX,
    })
    expect(deposit.state).toBe('AwaitingCompleteTransaction')
    expect(recorded).toEqual({
      transactions: 1,
      started: [],
      completed: [{ name: awaiting.name, call: { boundTx: BOUND_TX } }],
    })
  })

  test.each(refusedCompletions)(
    '$name: nothing is written',
    async ({ by, deposits, requests, wallet, expectError }) => {
      const { service, recorded, ready } = serviceOver({
        deposits,
        requests,
        actions: [vaultCall('completeDeposit')],
      })
      await ready
      await expectRefusal(
        service.completeDeposit(by, { name: awaiting.name, wallet, boundTx: BOUND_TX }),
        expectError,
      )
      expect(recorded).toEqual({ transactions: 0, started: [], completed: [] })
    },
  )

  test.each(mismatchedCalls('completeDeposit', 'startDeposit'))(
    '$name is refused before the deposit is read and nothing is written',
    async ({ actions, spendsCoins }) => {
      // No deposit is stored, so a refusal of the call shows the check ran first.
      const { service, recorded, ready } = serviceOver({ actions, spendsCoins })
      await ready
      const completing = service.completeDeposit(caller, {
        name: awaiting.name,
        wallet: WALLET,
        boundTx: BOUND_TX,
      })
      await expect(completing).rejects.toBeInstanceOf(DepositCallMismatch)
      await expect(completing).rejects.toThrow(
        'the bound bytes must be exactly one completeDeposit call to the vault',
      )
      expect(recorded).toEqual({ transactions: 0, started: [], completed: [] })
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
