import type { FacadeState } from '@midnightntwrk/wallet-sdk-facade'
import { describe, expect, test } from 'vitest'

import {
  formatSyncPosition,
  type SyncPosition,
  walletSyncProgress,
  type WalletSyncProgress,
} from '@/lib/midnight/wallet/wallet-sync-progress'
import { mock } from '@/lib/testing/mock'

describe('walletSyncProgress', () => {
  test.each<{ name: string; state: FacadeState; expected: WalletSyncProgress }>([
    {
      name: 'the shielded and DUST heads are highestRelevantWalletIndex, never highestIndex',
      state: facadeState({
        shielded: { appliedIndex: 160295n, highestRelevantWalletIndex: 160295n, complete: true },
        dust: { appliedIndex: 74906n, highestRelevantWalletIndex: 161823n, complete: false },
        unshielded: { appliedId: 78520n, highestTransactionId: 78520n, complete: true },
      }),
      expected: {
        shielded: { applied: 160295n, head: 160295n, synced: true },
        unshielded: { applied: 78520n, head: 78520n, synced: true },
        dust: { applied: 74906n, head: 161823n, synced: false },
      },
    },
  ])('$name', ({ state, expected }) => {
    expect(walletSyncProgress(state)).toEqual(expected)
  })
})

describe('formatSyncPosition', () => {
  test.each<{ name: string; position: SyncPosition; expected: string }>([
    {
      name: 'a synced wallet says so whatever its numbers',
      position: { applied: 0n, head: 0n, synced: true },
      expected: 'synced',
    },
    {
      name: 'a wallet with no head yet is connecting',
      position: { applied: 0n, head: 0n, synced: false },
      expected: 'connecting',
    },
    {
      name: 'a wallet part way shows its position and percentage',
      position: { applied: 74906n, head: 161823n, synced: false },
      expected: '74906/161823 (46%)',
    },
    {
      name: 'a wallet at its head but not yet complete caps at 100%',
      position: { applied: 161830n, head: 161823n, synced: false },
      expected: '161830/161823 (100%)',
    },
  ])('$name', ({ position, expected }) => {
    expect(formatSyncPosition(position)).toBe(expected)
  })
})

function facadeState(progress: {
  shielded: EventProgress
  dust: EventProgress
  unshielded: { appliedId: bigint; highestTransactionId: bigint; complete: boolean }
}): FacadeState {
  return mock<FacadeState>('FacadeState', {
    shielded: mock<FacadeState['shielded']>('ShieldedWalletState', {
      progress: eventProgress('shielded', progress.shielded),
    }),
    dust: mock<FacadeState['dust']>('DustWalletState', {
      progress: eventProgress('dust', progress.dust),
    }),
    unshielded: mock<FacadeState['unshielded']>('UnshieldedWalletState', {
      progress: mock<FacadeState['unshielded']['progress']>('UnshieldedSyncProgress', {
        appliedId: progress.unshielded.appliedId,
        highestTransactionId: progress.unshielded.highestTransactionId,
        isStrictlyComplete: () => progress.unshielded.complete,
      }),
    }),
  })
}

interface EventProgress {
  appliedIndex: bigint
  highestRelevantWalletIndex: bigint
  complete: boolean
}

/** `highestIndex` stays 0, as the SDK's event sync leaves it. */
function eventProgress(
  wallet: string,
  progress: EventProgress,
): FacadeState['shielded']['progress'] {
  return mock<FacadeState['shielded']['progress']>(`${wallet} SyncProgress`, {
    appliedIndex: progress.appliedIndex,
    highestRelevantWalletIndex: progress.highestRelevantWalletIndex,
    highestIndex: 0n,
    isStrictlyComplete: () => progress.complete,
  })
}
