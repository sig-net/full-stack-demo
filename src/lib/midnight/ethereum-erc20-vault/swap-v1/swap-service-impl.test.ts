import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { QuoteExactInputSingleArgs, UniswapQuoter } from '@/lib/ethereum/uniswap-quoter'
import type { Swap } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import {
  ERC20_ADDRESS_IN,
  ERC20_ADDRESS_OUT,
  swapFixture,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-fixtures'
import { SwapServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service-impl'
import {
  type CompleteSwapArgs,
  type StartSwapArgs,
  SwapStateConflict,
  type SwapStateController,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-controller'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type {
  CompleteSwapCircuitArgs,
  StartSwapCircuitArgs,
  VaultCircuits,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
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
const PAIR = { erc20AddressIn: ERC20_ADDRESS_IN, erc20AddressOut: ERC20_ADDRESS_OUT }

interface Recorded {
  steps: string[]
  quotes: QuoteExactInputSingleArgs[]
  startBuilds: StartSwapCircuitArgs[]
  completeBuilds: CompleteSwapCircuitArgs[]
  started: StartSwapArgs[]
  completed: CompleteSwapArgs[]
}

function serviceOver(options: {
  swaps?: Swap[]
  requests?: VaultRequest[]
  /** What each fee tier pays for the input, undefined for a tier with no pool. */
  quotesByFee?: Record<string, bigint | undefined>
}) {
  const recorded: Recorded = {
    steps: [],
    quotes: [],
    startBuilds: [],
    completeBuilds: [],
    started: [],
    completed: [],
  }
  const swapRepository = new MemoryRepository<Swap>()
  const vaultRequestRepository = new MemoryRepository<VaultRequest>()
  const ready = Promise.all([
    ...(options.swaps ?? []).map((swap) => swapRepository.create(swap)),
    ...(options.requests ?? []).map((request) => vaultRequestRepository.create(request)),
  ])
  const service = new SwapServiceImpl(
    swapRepository,
    mock<SwapStateController>('SwapStateController', {
      startSwap: async (args) => {
        recorded.started.push(args)
        const { call: _call, ...swap } = args
        return swapFixture(swap)
      },
      completeSwap: async (args) => {
        recorded.completed.push(args)
        return swapFixture({ name: args.name, state: 'AwaitingCompleteTransaction' })
      },
    }),
    vaultRequestRepository,
    mock<VaultCircuits>('VaultCircuits', {
      startSwap: async (args) => {
        recorded.steps.push('build')
        recorded.startBuilds.push(args)
        return 'start-call'
      },
      completeSwap: async (args) => {
        recorded.steps.push('build')
        recorded.completeBuilds.push(args)
        return 'complete-call'
      },
    }),
    mock<UniswapQuoter>('UniswapQuoter', {
      quoteExactInputSingle: async (args) => {
        recorded.quotes.push(args)
        return options.quotesByFee?.[args.fee.toString()]
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

const ownSwap = (overrides: Partial<Swap>) =>
  swapFixture({
    name: `${caller.name}/ethereum-erc20-vault-swaps/2a3b4c5d-6e7f-4890-9a1b-2c3d4e5f6a7b`,
    ...overrides,
  })
const attestedUnder = (parent: string, overrides: Partial<VaultRequest> = {}) => ({
  ...VAULT_REQUEST_IN_STATE.Attested,
  name: `${caller.name}/ethereum-erc20-vault-requests/7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f`,
  parent,
  action: 'swap' as const,
  ...overrides,
})

describe('SwapServiceImpl.quoteSwap', () => {
  const cases: ReadonlyArray<{
    name: string
    quotesByFee: Record<string, bigint | undefined>
    expected: { fee: bigint; amountOut: bigint; amountOutMinimum: bigint } | undefined
  }> = [
    {
      name: 'the tier paying most wins and the minimum takes one percent off',
      quotesByFee: { '500': 990_000n, '3000': 1_000_000n, '10000': undefined },
      expected: { fee: 3000n, amountOut: 1_000_000n, amountOutMinimum: 990_000n },
    },
    {
      name: 'one thin pool still quotes',
      quotesByFee: { '500': undefined, '3000': undefined, '10000': 10_000n },
      expected: { fee: 10000n, amountOut: 10_000n, amountOutMinimum: 9_900n },
    },
    {
      name: 'no pool, no quote',
      quotesByFee: { '500': undefined, '3000': undefined, '10000': undefined },
      expected: undefined,
    },
    {
      name: 'a pool paying nothing is no quote',
      quotesByFee: { '500': 0n, '3000': undefined, '10000': undefined },
      expected: undefined,
    },
  ]

  test.each(cases)('$name', async ({ quotesByFee, expected }) => {
    const { service, recorded } = serviceOver({ quotesByFee })
    const quote = await service.quoteSwap(caller, {
      ...PAIR,
      amountIn: 5_000_000n,
      slippageBps: 100n,
    })
    expect(recorded.quotes.map((args) => args.fee)).toEqual([500n, 3000n, 10000n])
    expect(recorded.quotes[0]).toEqual({
      tokenIn: ERC20_ADDRESS_IN,
      tokenOut: ERC20_ADDRESS_OUT,
      amountIn: 5_000_000n,
      fee: 500n,
    })
    expect(quote).toEqual(
      expected === undefined
        ? undefined
        : { ...PAIR, amountIn: 5_000_000n, slippageBps: 100n, ...expected },
    )
  })
})

describe('SwapServiceImpl.startSwap', () => {
  test('builds the start call with a coin of the sold vault token, then stores the swap under the vault account', async () => {
    const { service, recorded } = serviceOver({})
    const swapRequest = {
      ...PAIR,
      fee: 500n,
      amountOut: 1_000_000n,
      amountInMaximum: 1_100_000n,
    }
    const swap = await service.startSwap(caller, { swapRequest, wallet: WALLET })
    expect(recorded.steps).toEqual(['build', 'transaction'])
    expect(recorded.startBuilds).toEqual([
      {
        secretKey: caller.secretKey,
        wallet: WALLET,
        inIndex: swap.inIndex,
        ...swapRequest,
        coinType: vaultTokenType(ERC20_ADDRESS_IN, VAULT.contractAddress),
      },
    ])
    expect(recorded.started).toEqual([
      {
        name: expect.stringMatching(
          new RegExp(`^${caller.name}/ethereum-erc20-vault-swaps/${UUID}$`),
        ),
        ...swapRequest,
        inIndex: swap.inIndex,
        vaultAccount: vaultAccountOf(SIGNET, VAULT),
        call: { unprovenTx: 'start-call' },
      },
    ])
    expect(swap.inIndex).toBeGreaterThan(0n)
  })
})

describe('SwapServiceImpl.completeSwap', () => {
  test('builds the complete call from the attested request with two fresh nonces, then records it', async () => {
    const stored = ownSwap({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      swaps: [stored],
      requests: [attestedUnder(stored.name)],
    })
    await ready
    const swap = await service.completeSwap(caller, { name: stored.name, wallet: WALLET })
    expect(swap.state).toBe('AwaitingCompleteTransaction')
    expect(recorded.steps).toEqual(['build', 'transaction'])
    const [build] = recorded.completeBuilds
    expect(build).toMatchObject({
      secretKey: caller.secretKey,
      wallet: WALLET,
      requestId: REQUEST_ID,
      serializedOutput: new Uint8Array([1]),
    })
    expect(build?.mintNonce).toHaveLength(32)
    expect(build?.changeNonce).toHaveLength(32)
    expect(build?.mintNonce).not.toEqual(build?.changeNonce)
    expect(recorded.completed).toEqual([
      { name: stored.name, call: { unprovenTx: 'complete-call' } },
    ])
  })

  test('a failed trade completes over 32 zero bytes, which the circuit ignores', async () => {
    const stored = ownSwap({ state: 'AwaitingCompletion' })
    const { service, recorded, ready } = serviceOver({
      swaps: [stored],
      requests: [
        attestedUnder(stored.name, { attestationOutputKind: 'failed', attestationOutput: '' }),
      ],
    })
    await ready
    await service.completeSwap(caller, { name: stored.name, wallet: WALLET })
    expect(recorded.completeBuilds[0]?.serializedOutput).toEqual(new Uint8Array(32))
  })

  test('refuses before the build when the state does not allow a completion', async () => {
    const stored = ownSwap({ state: 'AwaitingVaultRequest' })
    const { service, recorded, ready } = serviceOver({ swaps: [stored] })
    await ready
    await expect(
      service.completeSwap(caller, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow(SwapStateConflict)
    expect(recorded.steps).toEqual([])
  })

  test("refuses another caller's swap as missing", async () => {
    const stored = ownSwap({ state: 'AwaitingCompletion' })
    const { service, ready } = serviceOver({ swaps: [stored] })
    await ready
    await expect(
      service.completeSwap(stranger, { name: stored.name, wallet: WALLET }),
    ).rejects.toThrow('does not exist')
  })
})

describe('SwapServiceImpl listing', () => {
  test("lists the caller's swaps newest first and gets only its own", async () => {
    const older = ownSwap({ createTime: new Date('2026-01-01T00:00:00Z') })
    const newer = ownSwap({
      name: `${caller.name}/ethereum-erc20-vault-swaps/3a3b4c5d-6e7f-4890-9a1b-2c3d4e5f6a7b`,
      createTime: new Date('2026-01-02T00:00:00Z'),
    })
    const theirs = swapFixture({
      name: `${stranger.name}/ethereum-erc20-vault-swaps/4a3b4c5d-6e7f-4890-9a1b-2c3d4e5f6a7b`,
    })
    const { service, ready } = serviceOver({ swaps: [older, newer, theirs] })
    await ready
    expect(await service.listSwaps(caller, {})).toEqual([newer, older])
    expect(await service.getSwap(caller, { name: theirs.name })).toBeUndefined()
    expect(await service.getSwap(stranger, { name: theirs.name })).toEqual(theirs)
  })
})
