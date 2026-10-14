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
  type StartSupplyArgs,
  SupplyStateConflict,
  type SupplyStateController,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type {
  CompleteSupplyCircuitArgs,
  StartSupplyCircuitArgs,
  VaultCircuits,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { SpenderLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import { ledgerSet } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  REQUEST_ID,
  VAULT_REQUEST_IN_STATE,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { vaultTokenType } from '@/lib/midnight/ethereum-erc20-vault/vault-token-infos'
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
const stranger: Caller = resolveCaller('cd'.repeat(32))
const WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const REQUEST = { amount: 1_000_000n }
const SHARES_OUTPUT = `40420f${'00'.repeat(29)}`

interface Recorded {
  steps: string[]
  startBuilds: StartSupplyCircuitArgs[]
  completeBuilds: CompleteSupplyCircuitArgs[]
  started: StartSupplyArgs[]
  completed: { name: string; unprovenTx: string }[]
  allowanceReads: string[][]
}

function serviceOver(options: {
  supplies?: Supply[]
  requests?: VaultRequest[]
  allowance?: bigint
}) {
  const recorded: Recorded = {
    steps: [],
    startBuilds: [],
    completeBuilds: [],
    started: [],
    completed: [],
    allowanceReads: [],
  }
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
        const { unprovenTx: _unprovenTx, ...supply } = args
        return supplyFixture(supply)
      },
      completeSupply: async (args) => {
        recorded.completed.push(args)
        return supplyFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
      },
    }),
    vaultRequestRepository,
    mock<VaultCircuits>('VaultCircuits', {
      startSupply: async (args) => {
        recorded.steps.push('build')
        recorded.startBuilds.push(args)
        return 'start-call'
      },
      completeSupply: async (args) => {
        recorded.steps.push('build')
        recorded.completeBuilds.push(args)
        return 'complete-call'
      },
    }),
    mock<SpenderLedger>('SpenderLedger', {
      state: async () => {
        recorded.steps.push('ledger')
        return {
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

describe('SupplyServiceImpl.startSupply', () => {
  test('reads the pair, builds the start call with a coin of the underlying, then stores the supply under the vault account', async () => {
    const { service, recorded } = serviceOver({})
    const supply = await service.startSupply(caller, { supplyRequest: REQUEST, wallet: WALLET })
    expect(recorded.steps).toEqual(['ledger', 'build', 'transaction'])
    expect(recorded.startBuilds).toEqual([
      {
        secretKey: caller.secretKey,
        wallet: WALLET,
        inIndex: supply.inIndex,
        amount: REQUEST.amount,
        coinType: vaultTokenType(UNDERLYING_ERC20_ADDRESS, VAULT.contractAddress),
      },
    ])
    expect(recorded.started).toEqual([
      {
        name: expect.stringMatching(
          new RegExp(`^${caller.name}/ethereum-erc20-vault-supplies/${UUID}$`),
        ),
        underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
        stataErc20Address: STATA_ERC20_ADDRESS,
        amount: REQUEST.amount,
        inIndex: supply.inIndex,
        vaultAccount: vaultAccountOf(SIGNET, VAULT),
        unprovenTx: 'start-call',
      },
    ])
    expect(supply.inIndex).toBeGreaterThan(0n)
  })
})

describe('SupplyServiceImpl.completeSupply', () => {
  test('builds the complete call from the attested shares with a fresh nonce, then records it', async () => {
    const stored = ownSupply({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      supplies: [stored],
      requests: [attestedUnder(stored.name)],
    })
    await ready
    const supply = await service.completeSupply(caller, { name: stored.name, wallet: WALLET })
    expect(supply.state).toBe('AwaitingCompleteTransaction')
    expect(recorded.steps).toEqual(['build', 'transaction'])
    const [build] = recorded.completeBuilds
    expect(build).toMatchObject({
      secretKey: caller.secretKey,
      wallet: WALLET,
      requestId: REQUEST_ID,
      serializedOutput: hexToBytes(SHARES_OUTPUT),
    })
    expect(build?.mintNonce).toHaveLength(32)
    expect(recorded.completed).toEqual([{ name: stored.name, unprovenTx: 'complete-call' }])
  })

  test('a failed deposit completes over 32 zero bytes, which the circuit ignores', async () => {
    const stored = ownSupply({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      supplies: [stored],
      requests: [
        attestedUnder(stored.name, { attestationOutputKind: 'failed', attestationOutput: '' }),
      ],
    })
    await ready
    await service.completeSupply(caller, { name: stored.name, wallet: WALLET })
    expect(recorded.completeBuilds[0]?.serializedOutput).toEqual(new Uint8Array(32))
  })

  test('refuses before the build when the state does not allow a completion', async () => {
    const stored = ownSupply({ state: 'AwaitingVaultRequest' })
    const { service, recorded, ready } = serviceOver({ supplies: [stored] })
    await ready
    await expect(
      service.completeSupply(caller, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow(SupplyStateConflict)
    expect(recorded.steps).toEqual([])
  })

  test("refuses another caller's supply as missing", async () => {
    const stored = ownSupply({ state: 'AwaitingCompletion' })
    const { service, ready } = serviceOver({ supplies: [stored] })
    await ready
    await expect(
      service.completeSupply(stranger, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow('does not exist')
  })
})

describe('SupplyServiceImpl listing', () => {
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
