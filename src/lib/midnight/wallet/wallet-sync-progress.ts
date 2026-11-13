import type { FacadeState } from '@midnightntwrk/wallet-sdk-facade'

/** How far each of a facade's three wallets has synchronised; the facade is synced once all three are. */
export interface WalletSyncProgress {
  readonly shielded: SyncPosition
  readonly unshielded: SyncPosition
  readonly dust: SyncPosition
}

export function walletSyncProgress(state: FacadeState): WalletSyncProgress {
  const unshielded = state.unshielded.progress
  return {
    shielded: eventSyncPosition(state.shielded.progress),
    unshielded: {
      applied: unshielded.appliedId,
      head: unshielded.highestTransactionId,
      synced: unshielded.isStrictlyComplete(),
    },
    dust: eventSyncPosition(state.dust.progress),
  }
}

/** One wallet's position in its indexer stream. */
export interface SyncPosition {
  /** The id of the last update the wallet applied. */
  readonly applied: bigint
  /** The stream's latest id, 0 until the wallet receives its first batch. */
  readonly head: bigint
  readonly synced: boolean
}

/** `synced`, `connecting` before the head is known, or `applied/head (percent%)`. */
export function formatSyncPosition(position: SyncPosition): string {
  if (position.synced) return 'synced'
  if (position.head <= 0n) return 'connecting'
  const percent =
    position.applied >= position.head ? 100n : (position.applied * 100n) / position.head
  return `${position.applied.toString()}/${position.head.toString()} (${percent.toString()}%)`
}

/** The shielded and DUST wallets' head is `highestRelevantWalletIndex`, which their completeness check compares against: their event sync leaves `highestIndex` at 0. */
function eventSyncPosition(progress: FacadeState['shielded']['progress']): SyncPosition {
  return {
    applied: progress.appliedIndex,
    head: progress.highestRelevantWalletIndex,
    synced: progress.isStrictlyComplete(),
  }
}
