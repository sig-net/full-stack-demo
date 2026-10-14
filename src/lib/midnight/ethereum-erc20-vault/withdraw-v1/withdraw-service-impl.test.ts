import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type {
  CompleteWithdrawCircuitArgs,
  StartWithdrawCircuitArgs,
  VaultCircuits,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  REQUEST_ID,
  VAULT_REQUEST_IN_STATE,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { vaultTokenType } from '@/lib/midnight/ethereum-erc20-vault/vault-token-infos'
import type { Withdraw } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import {
  DESTINATION,
  ERC20_ADDRESS,
  withdrawFixture,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-fixtures'
import { WithdrawServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-impl'
import {
  type StartWithdrawArgs,
  WithdrawStateConflict,
  type WithdrawStateController,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-controller'
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
const REQUEST = { erc20Address: ERC20_ADDRESS, amount: 1_000_000n, destEvmAddress: DESTINATION }

interface Recorded {
  steps: string[]
  startBuilds: StartWithdrawCircuitArgs[]
  completeBuilds: CompleteWithdrawCircuitArgs[]
  started: StartWithdrawArgs[]
  completed: { name: string; unprovenTx: string }[]
}

function serviceOver(options: { withdraws?: Withdraw[]; requests?: VaultRequest[] }) {
  const recorded: Recorded = {
    steps: [],
    startBuilds: [],
    completeBuilds: [],
    started: [],
    completed: [],
  }
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
        const { unprovenTx: _unprovenTx, ...withdraw } = args
        return withdrawFixture(withdraw)
      },
      completeWithdraw: async (args) => {
        recorded.completed.push(args)
        return withdrawFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
      },
    }),
    vaultRequestRepository,
    mock<VaultCircuits>('VaultCircuits', {
      startWithdraw: async (args) => {
        recorded.steps.push('build')
        recorded.startBuilds.push(args)
        return 'start-call'
      },
      completeWithdraw: async (args) => {
        recorded.steps.push('build')
        recorded.completeBuilds.push(args)
        return 'complete-call'
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

describe('WithdrawServiceImpl.startWithdraw', () => {
  test('builds the start call with a coin of the sent vault token, then stores the withdrawal under the vault account', async () => {
    const { service, recorded } = serviceOver({})
    const withdraw = await service.startWithdraw(caller, {
      withdrawRequest: REQUEST,
      wallet: WALLET,
    })
    expect(recorded.steps).toEqual(['build', 'transaction'])
    expect(recorded.startBuilds).toEqual([
      {
        secretKey: caller.secretKey,
        wallet: WALLET,
        inIndex: withdraw.inIndex,
        ...REQUEST,
        coinType: vaultTokenType(ERC20_ADDRESS, VAULT.contractAddress),
      },
    ])
    expect(recorded.started).toEqual([
      {
        name: expect.stringMatching(
          new RegExp(`^${caller.name}/ethereum-erc20-vault-withdraws/${UUID}$`),
        ),
        ...REQUEST,
        inIndex: withdraw.inIndex,
        vaultAccount: vaultAccountOf(SIGNET, VAULT),
        unprovenTx: 'start-call',
      },
    ])
    expect(withdraw.inIndex).toBeGreaterThan(0n)
  })
})

describe('WithdrawServiceImpl.completeWithdraw', () => {
  test('builds the complete call from the attested request with a fresh nonce, then records it', async () => {
    const stored = ownWithdraw({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      withdraws: [stored],
      requests: [attestedUnder(stored.name)],
    })
    await ready
    const withdraw = await service.completeWithdraw(caller, { name: stored.name, wallet: WALLET })
    expect(withdraw.state).toBe('AwaitingCompleteTransaction')
    expect(recorded.steps).toEqual(['build', 'transaction'])
    const [build] = recorded.completeBuilds
    expect(build).toMatchObject({
      secretKey: caller.secretKey,
      wallet: WALLET,
      requestId: REQUEST_ID,
      serializedOutput: new Uint8Array([1]),
    })
    expect(build?.mintNonce).toHaveLength(32)
    expect(recorded.completed).toEqual([{ name: stored.name, unprovenTx: 'complete-call' }])
  })

  test('a failed transfer completes over one zero byte, which the circuit ignores', async () => {
    const stored = ownWithdraw({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      withdraws: [stored],
      requests: [
        attestedUnder(stored.name, { attestationOutputKind: 'failed', attestationOutput: '' }),
      ],
    })
    await ready
    await service.completeWithdraw(caller, { name: stored.name, wallet: WALLET })
    expect(recorded.completeBuilds[0]?.serializedOutput).toEqual(new Uint8Array([0]))
  })

  test('refuses before the build when the state does not allow a completion', async () => {
    const stored = ownWithdraw({ state: 'AwaitingVaultRequest' })
    const { service, recorded, ready } = serviceOver({ withdraws: [stored] })
    await ready
    await expect(
      service.completeWithdraw(caller, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow(WithdrawStateConflict)
    expect(recorded.steps).toEqual([])
  })

  test("refuses another caller's withdrawal as missing", async () => {
    const stored = ownWithdraw({ state: 'AwaitingCompletion' })
    const { service, ready } = serviceOver({ withdraws: [stored] })
    await ready
    await expect(
      service.completeWithdraw(stranger, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow('does not exist')
  })
})

describe('WithdrawServiceImpl listing', () => {
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
