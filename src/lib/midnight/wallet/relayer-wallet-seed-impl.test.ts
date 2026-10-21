import type { FacadeState, WalletFacade } from '@midnightntwrk/wallet-sdk-facade'
import { describe, expect, test } from 'vitest'

import { MIDNIGHT_NETWORK_DEFAULTS } from '@/lib/config/midnight-network-config'
import {
  RelayerWalletSeedImpl,
  type StartSyncedFacade,
} from '@/lib/midnight/wallet/relayer-wallet-seed-impl'
import { mock } from '@/lib/testing/mock'

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
const failing = (): Promise<WalletFacade> => Promise.reject(new Error('indexer down'))

/** Lets a settled start's handlers run before the next call. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('RelayerWalletSeedImpl.dustBalance', () => {
  test.each<{
    name: string
    /** The outcome of each start, in the order the wallet asks for them. */
    starts: (() => Promise<WalletFacade>)[]
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
    const startFacade: StartSyncedFacade = () => {
      const start = starts[started]
      started += 1
      if (start === undefined) throw new Error('the test scripted no further start')
      return start()
    }
    const wallet = new RelayerWalletSeedImpl(
      MIDNIGHT_NETWORK_DEFAULTS.undeployed,
      SEED,
      startFacade,
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
