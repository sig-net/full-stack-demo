import { hexToBytes } from '@sig-net/midnight'
import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { Redeem } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import {
  STATA_ERC20_ADDRESS,
  redeemFixture,
  UNDERLYING_ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-fixtures'
import { RedeemServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-impl'
import {
  type CompleteRedeemArgs,
  type StartRedeemArgs,
  RedeemStateConflict,
  type RedeemStateController,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-controller'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type {
  CompleteRedeemCircuitArgs,
  StartRedeemCircuitArgs,
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
const REQUEST = { shares: 300_000n }
const ASSETS_OUTPUT = `40420f${'00'.repeat(29)}`

interface Recorded {
  steps: string[]
  startBuilds: StartRedeemCircuitArgs[]
  completeBuilds: CompleteRedeemCircuitArgs[]
  started: StartRedeemArgs[]
  completed: CompleteRedeemArgs[]
}

function serviceOver(options: { redeems?: Redeem[]; requests?: VaultRequest[] }) {
  const recorded: Recorded = {
    steps: [],
    startBuilds: [],
    completeBuilds: [],
    started: [],
    completed: [],
  }
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
    mock<VaultCircuits>('VaultCircuits', {
      startRedeem: async (args) => {
        recorded.steps.push('build')
        recorded.startBuilds.push(args)
        return 'start-call'
      },
      completeRedeem: async (args) => {
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

describe('RedeemServiceImpl.startRedeem', () => {
  test('reads the pair, builds the start call with a coin of the wrapper, then stores the redeem under the vault account', async () => {
    const { service, recorded } = serviceOver({})
    const redeem = await service.startRedeem(caller, { redeemRequest: REQUEST, wallet: WALLET })
    expect(recorded.steps).toEqual(['ledger', 'build', 'transaction'])
    expect(recorded.startBuilds).toEqual([
      {
        secretKey: caller.secretKey,
        wallet: WALLET,
        inIndex: redeem.inIndex,
        shares: REQUEST.shares,
        coinType: vaultTokenType(STATA_ERC20_ADDRESS, VAULT.contractAddress),
      },
    ])
    expect(recorded.started).toEqual([
      {
        name: expect.stringMatching(
          new RegExp(`^${caller.name}/ethereum-erc20-vault-redeems/${UUID}$`),
        ),
        stataErc20Address: STATA_ERC20_ADDRESS,
        underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
        shares: REQUEST.shares,
        inIndex: redeem.inIndex,
        vaultAccount: vaultAccountOf(SIGNET, VAULT),
        call: { unprovenTx: 'start-call' },
      },
    ])
    expect(redeem.inIndex).toBeGreaterThan(0n)
  })
})

describe('RedeemServiceImpl.completeRedeem', () => {
  test('builds the complete call from the attested assets with a fresh nonce, then records it', async () => {
    const stored = ownRedeem({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      redeems: [stored],
      requests: [attestedUnder(stored.name)],
    })
    await ready
    const redeem = await service.completeRedeem(caller, { name: stored.name, wallet: WALLET })
    expect(redeem.state).toBe('AwaitingCompleteTransaction')
    expect(recorded.steps).toEqual(['build', 'transaction'])
    const [build] = recorded.completeBuilds
    expect(build).toMatchObject({
      secretKey: caller.secretKey,
      wallet: WALLET,
      requestId: REQUEST_ID,
      serializedOutput: hexToBytes(ASSETS_OUTPUT),
    })
    expect(build?.mintNonce).toHaveLength(32)
    expect(recorded.completed).toEqual([
      { name: stored.name, call: { unprovenTx: 'complete-call' } },
    ])
  })

  test('a failed redeem completes over 32 zero bytes, which the circuit ignores', async () => {
    const stored = ownRedeem({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      redeems: [stored],
      requests: [
        attestedUnder(stored.name, { attestationOutputKind: 'failed', attestationOutput: '' }),
      ],
    })
    await ready
    await service.completeRedeem(caller, { name: stored.name, wallet: WALLET })
    expect(recorded.completeBuilds[0]?.serializedOutput).toEqual(new Uint8Array(32))
  })

  test('refuses before the build when the state does not allow a completion', async () => {
    const stored = ownRedeem({ state: 'AwaitingVaultRequest' })
    const { service, recorded, ready } = serviceOver({ redeems: [stored] })
    await ready
    await expect(
      service.completeRedeem(caller, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow(RedeemStateConflict)
    expect(recorded.steps).toEqual([])
  })

  test("refuses another caller's redeem as missing", async () => {
    const stored = ownRedeem({ state: 'AwaitingCompletion' })
    const { service, ready } = serviceOver({ redeems: [stored] })
    await ready
    await expect(
      service.completeRedeem(stranger, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow('does not exist')
  })
})

describe('RedeemServiceImpl listing', () => {
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
