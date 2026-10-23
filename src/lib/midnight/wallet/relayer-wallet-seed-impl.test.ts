import type { FacadeState, WalletFacade } from '@midnightntwrk/wallet-sdk-facade'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { MIDNIGHT_NETWORK_DEFAULTS } from '@/lib/config/midnight-network-config'
import {
  RelayerWalletSeedImpl,
  type StartSyncedFacade,
} from '@/lib/midnight/wallet/relayer-wallet-seed-impl'
import type { WalletSyncProgress } from '@/lib/midnight/wallet/wallet-sync-progress'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const SEED = `${'00'.repeat(31)}01`
const DUST = 7n

const syncedFacade = (): Promise<WalletFacade> =>
  Promise.resolve(
    mock<WalletFacade>('WalletFacade', {
      waitForSyncedState: () =>
        Promise.resolve(
          mock<FacadeState>('FacadeState', {
            dust: mock<FacadeState['dust']>('DustWalletState', { balance: () => DUST }),
          }),
        ),
    }),
  )
const syncing = (): Promise<WalletFacade> => new Promise(() => undefined)
const PROGRESS: WalletSyncProgress = {
  shielded: { applied: 160295n, head: 160295n, synced: true },
  unshielded: { applied: 0n, head: 0n, synced: false },
  dust: { applied: 74906n, head: 161823n, synced: false },
}
const syncingWithProgress = (
  onProgress: (progress: WalletSyncProgress) => void,
): Promise<WalletFacade> => {
  onProgress(PROGRESS)
  return syncing()
}
const failing = (): Promise<WalletFacade> => Promise.reject(new Error('indexer down'))

/** Lets a settled start's handlers run before the next call. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('RelayerWalletSeedImpl.dustBalance', () => {
  test.each<{
    name: string
    /** The outcome of each start, in the order the wallet asks for them. */
    starts: ((onProgress: (progress: WalletSyncProgress) => void) => Promise<WalletFacade>)[]
    /** What runs before the call under test. */
    before: (wallet: RelayerWalletSeedImpl) => Promise<void>
    expected: { balance: bigint } | { refusal: string }
    startCount: number
  }>([
    {
      name: 'a wallet nothing has started is refused at once, and the call starts it',
      starts: [syncing],
      before: () => Promise.resolve(),
      expected: { refusal: 'The relayer wallet is still synchronising.' },
      startCount: 1,
    },
    {
      name: 'a sync in progress is refused at once without a second start',
      starts: [syncing],
      before: async (wallet) => {
        void wallet.start()
        await settle()
      },
      expected: { refusal: 'The relayer wallet is still synchronising.' },
      startCount: 1,
    },
    {
      name: 'a sync that has reported progress is refused with each wallet position',
      starts: [syncingWithProgress],
      before: async (wallet) => {
        void wallet.start()
        await settle()
      },
      expected: {
        refusal:
          'The relayer wallet is still synchronising: shielded synced, unshielded connecting, DUST 74906/161823 (46%).',
      },
      startCount: 1,
    },
    {
      name: 'a synced wallet answers its DUST',
      starts: [syncedFacade],
      before: (wallet) => wallet.start(),
      expected: { balance: DUST },
      startCount: 1,
    },
    {
      name: 'a failed start is reported with its reason, and the call starts the wallet again',
      starts: [failing, syncing],
      before: async (wallet) => {
        await wallet.start().catch(() => undefined)
      },
      expected: { refusal: 'The relayer wallet failed to start and is retrying: indexer down' },
      startCount: 2,
    },
  ])('$name', async ({ starts, before, expected, startCount }) => {
    let started = 0
    const startFacade: StartSyncedFacade = (_keys, _config, onProgress) => {
      const start = starts[started]
      started += 1
      if (start === undefined) throw new Error('the test scripted no further start')
      return start(onProgress)
    }
    const wallet = new RelayerWalletSeedImpl(
      MIDNIGHT_NETWORK_DEFAULTS.undeployed,
      SEED,
      startFacade,
      new RecordingLogger(),
    )
    await before(wallet)
    const call = wallet.dustBalance()
    if ('balance' in expected) {
      await expect(call).resolves.toBe(expected.balance)
    } else {
      await expect(call).rejects.toThrow(expected.refusal)
    }
    expect(started).toBe(startCount)
  })
})

describe('RelayerWalletSeedImpl sync logging', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test.each<{
    name: string
    /** Milliseconds after the start at which the facade reports progress. */
    reportsAt: number[]
    /** How many `relayer wallet syncing` lines the reports produce. */
    lines: number
  }>([
    { name: 'the first report is written at once', reportsAt: [0], lines: 1 },
    {
      name: 'reports within ten seconds of a line are not written',
      reportsAt: [0, 5_000, 9_999],
      lines: 1,
    },
    {
      name: 'a report ten seconds after the last line is written',
      reportsAt: [0, 5_000, 10_000],
      lines: 2,
    },
  ])('$name', async ({ reportsAt, lines }) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    const logger = new RecordingLogger()
    const wallet = new RelayerWalletSeedImpl(
      MIDNIGHT_NETWORK_DEFAULTS.undeployed,
      SEED,
      (_keys, _config, onProgress) => {
        for (const at of reportsAt) {
          vi.setSystemTime(at)
          onProgress(PROGRESS)
        }
        return syncing()
      },
      logger,
    )
    void wallet.start()
    await Promise.resolve()
    const syncingLines = logger
      .at('info')
      .filter((line) => line.message === 'relayer wallet syncing')
    expect(syncingLines).toHaveLength(lines)
    expect(syncingLines[0]?.fields).toEqual({
      shieldedApplied: 160295n,
      shieldedHead: 160295n,
      unshieldedApplied: 0n,
      unshieldedHead: 0n,
      dustApplied: 74906n,
      dustHead: 161823n,
    })
  })
})
