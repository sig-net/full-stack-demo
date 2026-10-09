import 'server-only'

import { CallTxFailedError } from '@midnight-ntwrk/midnight-js/contracts'
import { FailFallible } from '@midnight-ntwrk/midnight-js/types'

import type { Flusher } from '@/lib/midnight/ethereum-erc20-vault/flusher'

/**
 * One flush in flight per process. `runFlush` is the SDK's `flushPending` over the relayer's
 * providers, resolving with the slots it filled, and `onFlushed` nudges every request waiting
 * for a flush after one landed.
 */
export class FlusherImpl implements Flusher {
  private readonly runFlush: () => Promise<number>
  private readonly onFlushed: () => Promise<void>
  private running: Promise<void> | undefined
  private runAgain = false

  constructor(runFlush: () => Promise<number>, onFlushed: () => Promise<void>) {
    this.runFlush = runFlush
    this.onFlushed = onFlushed
  }

  flush(): Promise<void> {
    if (this.running) {
      this.runAgain = true
      return this.running
    }
    this.running = this.runUntilDrained().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  /** A lost race runs again at once, and any other failure ends the run until the next nudge or sweep. */
  private async runUntilDrained(): Promise<void> {
    do {
      this.runAgain = false
      let filled: number
      try {
        filled = await this.runFlush()
      } catch (error: unknown) {
        if (!isLostRace(error)) {
          console.error('Flush failed', error)
          return
        }
        this.runAgain = true
        continue
      }
      // A flush carries at most the width, so more may wait behind a flush that landed.
      if (filled > 0) {
        await this.onFlushed()
        this.runAgain = true
      }
    } while (this.runAgain)
  }
}

/**
 * A flush that another flush beat: it landed as `FailFallible` with its fee paid, or the build
 * tripped one of `flushQueue`'s asserts on an item the other flush had moved. `FailEntirely`
 * means the guaranteed section failed, which a rerun would repeat.
 */
function isLostRace(error: unknown): boolean {
  if (error instanceof CallTxFailedError) return error.finalizedTxData.status === FailFallible
  return error instanceof Error && FLUSH_RACE_ASSERT.test(error.message)
}

/** The compact runtime prefixes the contract's assert message, and the build rethrows it as a plain `Error`. */
const FLUSH_RACE_ASSERT =
  /^failed assert: (?:Request not queued|Identical request open|Attestation not queued)$/
