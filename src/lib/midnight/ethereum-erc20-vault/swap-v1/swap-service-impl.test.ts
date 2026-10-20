import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { QuoteExactInputSingleArgs, UniswapQuoter } from '@/lib/ethereum/uniswap-quoter'
import {
  type SponsoredCallGuard,
  SponsoredCallMismatch,
  type SponsoredCircuit,
} from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
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
const PAIR = { erc20AddressIn: ERC20_ADDRESS_IN, erc20AddressOut: ERC20_ADDRESS_OUT }
const REQUEST = { ...PAIR, fee: 500n, amountOut: 1_000_000n, amountInMaximum: 1_100_000n }
const AMOUNT_IN_OUTPUT = `40420f${'00'.repeat(29)}`
const BOUND_TX = 'b0bd'

/** What the service quoted, wrote and asked the guard, in order, so a test can see that a refusal writes nothing and a commit opens one transaction after its reads. */
interface Recorded {
  steps: string[]
  quotes: QuoteExactInputSingleArgs[]
  guarded: SponsoredCircuit[]
  started: StartSwapArgs[]
  completed: CompleteSwapArgs[]
}

const NOTHING_RECORDED: Recorded = {
  steps: [],
  quotes: [],
  guarded: [],
  started: [],
  completed: [],
}

function serviceOver(options: {
  swaps?: Swap[]
  requests?: VaultRequest[]
  /** What each fee tier pays for the input, undefined for a tier with no pool. */
  quotesByFee?: Record<string, bigint | undefined>
  /** Whether the guard refuses the bound bytes, admitting them when absent. */
  refusesCall?: boolean
}) {
  const recorded: Recorded = structuredClone(NOTHING_RECORDED)
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
    mock<SponsoredCallGuard>('SponsoredCallGuard', {
      assertSponsoredCall: (boundTx, circuit) => {
        expect(boundTx).toBe(BOUND_TX)
        recorded.steps.push('guard')
        recorded.guarded.push(circuit)
        if (options.refusesCall === true) throw new SponsoredCallMismatch(circuit)
      },
    }),
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
  attestationOutput: AMOUNT_IN_OUTPUT,
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

describe('SwapServiceImpl.prepareStartSwap', () => {
  test('assigns a fresh slot on every call, and nothing is written', async () => {
    const { service, recorded } = serviceOver({})
    const first = await service.prepareStartSwap(caller, { swapRequest: REQUEST })
    const second = await service.prepareStartSwap(caller, { swapRequest: REQUEST })
    for (const { inIndex } of [first, second]) {
      expect(inIndex).toBeGreaterThanOrEqual(0n)
      expect(inIndex).toBeLessThanOrEqual(UINT64_MAX)
    }
    expect(first.inIndex).not.toBe(second.inIndex)
    expect(recorded).toEqual(NOTHING_RECORDED)
  })
})

describe('SwapServiceImpl.startSwap', () => {
  test('guards the bound call and commits it under the vault account in one transaction', async () => {
    const { service, recorded } = serviceOver({})
    const swap = await service.startSwap(caller, {
      swapRequest: REQUEST,
      inIndex: 42n,
      boundTx: BOUND_TX,
    })
    expect(swap.name).toMatch(new RegExp(`^${caller.name}/ethereum-erc20-vault-swaps/${UUID}$`))
    expect(swap).toMatchObject({
      ...REQUEST,
      state: 'AwaitingStartTransaction',
      inIndex: 42n,
      vaultAccount: vaultAccountOf(SIGNET, VAULT),
      outcome: null,
      failure: null,
      error: null,
    })
    expect(recorded).toEqual({
      ...NOTHING_RECORDED,
      steps: ['guard', 'transaction'],
      guarded: ['startSwap'],
      started: [
        {
          name: swap.name,
          ...REQUEST,
          inIndex: 42n,
          vaultAccount: vaultAccountOf(SIGNET, VAULT),
          call: { boundTx: BOUND_TX },
        },
      ],
    })
  })

  test('bound bytes the guard refuses are refused and nothing is written', async () => {
    const { service, recorded } = serviceOver({ refusesCall: true })
    const starting = service.startSwap(caller, {
      swapRequest: REQUEST,
      inIndex: 42n,
      boundTx: BOUND_TX,
    })
    await expect(starting).rejects.toBeInstanceOf(SponsoredCallMismatch)
    await expect(starting).rejects.toThrow(
      'the bound bytes must be exactly one startSwap call to the vault',
    )
    expect(recorded).toEqual({ ...NOTHING_RECORDED, steps: ['guard'], guarded: ['startSwap'] })
  })
})

const awaiting = ownSwap({ state: 'AwaitingCompletion' })

interface Refusal {
  name: string
  by: Caller
  swaps: Swap[]
  requests: VaultRequest[]
  expectError: string | typeof SwapStateConflict
}

/** What both completion methods refuse before anything is read from the request. */
const refusedCompletions: readonly Refusal[] = [
  {
    name: "another caller's swap does not exist for this caller",
    by: stranger,
    swaps: [awaiting],
    requests: [attestedUnder(awaiting.name)],
    expectError: 'does not exist',
  },
  {
    name: 'a swap that was never started',
    by: caller,
    swaps: [],
    requests: [],
    expectError: 'does not exist',
  },
  {
    name: 'a swap still waiting for its request',
    by: caller,
    swaps: [ownSwap({ state: 'AwaitingVaultRequest' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: SwapStateConflict,
  },
  {
    name: 'a swap already completing',
    by: caller,
    swaps: [ownSwap({ state: 'AwaitingCompleteTransaction' })],
    requests: [attestedUnder(awaiting.name)],
    expectError: SwapStateConflict,
  },
]

/** What the request read refuses, which only the prepare method makes. */
const refusedPreparations: readonly Refusal[] = [
  {
    name: 'a swap whose request holds no attestation',
    by: caller,
    swaps: [awaiting],
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
    name: 'a swap without a request row',
    by: caller,
    swaps: [awaiting],
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

describe('SwapServiceImpl.prepareCompleteSwap', () => {
  const inputs: ReadonlyArray<{
    name: string
    request: VaultRequest
    expectKind: 'executed' | 'failed' | 'unviable'
    expectOutput: string
  }> = [
    {
      name: "an executed trade's attested amount spent",
      request: attestedUnder(awaiting.name),
      expectKind: 'executed',
      expectOutput: AMOUNT_IN_OUTPUT,
    },
    {
      name: 'a failed trade, whose output is empty',
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
        swaps: [awaiting],
        requests: [request],
      })
      await ready
      expect(await service.prepareCompleteSwap(caller, { name: awaiting.name })).toEqual({
        requestId: REQUEST_ID_HEX,
        attestationOutputKind: expectKind,
        attestationOutput: expectOutput,
      })
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )

  test.each([...refusedCompletions, ...refusedPreparations])(
    '$name: nothing is written',
    async ({ by, swaps, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ swaps, requests })
      await ready
      await expectRefusal(service.prepareCompleteSwap(by, { name: awaiting.name }), expectError)
      expect(recorded).toEqual(NOTHING_RECORDED)
    },
  )
})

describe('SwapServiceImpl.completeSwap', () => {
  test('commits the bound call in one transaction after the state check', async () => {
    const { service, recorded, ready } = serviceOver({
      swaps: [awaiting],
      requests: [attestedUnder(awaiting.name)],
    })
    await ready
    const swap = await service.completeSwap(caller, { name: awaiting.name, boundTx: BOUND_TX })
    expect(swap.state).toBe('AwaitingCompleteTransaction')
    expect(recorded).toEqual({
      ...NOTHING_RECORDED,
      steps: ['guard', 'transaction'],
      guarded: ['completeSwap'],
      completed: [{ name: awaiting.name, call: { boundTx: BOUND_TX } }],
    })
  })

  test.each(refusedCompletions)(
    '$name: nothing is written',
    async ({ by, swaps, requests, expectError }) => {
      const { service, recorded, ready } = serviceOver({ swaps, requests })
      await ready
      await expectRefusal(
        service.completeSwap(by, { name: awaiting.name, boundTx: BOUND_TX }),
        expectError,
      )
      expect(recorded).toEqual({
        ...NOTHING_RECORDED,
        steps: ['guard'],
        guarded: ['completeSwap'],
      })
    },
  )

  test('bound bytes the guard refuses are refused before the swap is read and nothing is written', async () => {
    // No swap is stored, so a refusal of the call shows the guard ran first.
    const { service, recorded } = serviceOver({ refusesCall: true })
    const completing = service.completeSwap(caller, { name: awaiting.name, boundTx: BOUND_TX })
    await expect(completing).rejects.toBeInstanceOf(SponsoredCallMismatch)
    await expect(completing).rejects.toThrow(
      'the bound bytes must be exactly one completeSwap call to the vault',
    )
    expect(recorded).toEqual({
      ...NOTHING_RECORDED,
      steps: ['guard'],
      guarded: ['completeSwap'],
    })
  })
})

describe('SwapServiceImpl reads', () => {
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
