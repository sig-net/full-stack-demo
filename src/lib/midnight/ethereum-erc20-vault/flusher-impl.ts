import 'server-only'

import { CallTxFailedError } from '@midnight-ntwrk/midnight-js/contracts'
import { FailFallible } from '@midnight-ntwrk/midnight-js/types'

import { CoalescingRunner } from '@/lib/coalescing-runner'
import { caughtError, type Logger } from '@/lib/logging/logger'
import type { Flusher } from '@/lib/midnight/ethereum-erc20-vault/flusher'
import { circuitAssertMessage } from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/**
 * One flush in flight per process. `runFlush` is the SDK's `flushPending` over the relayer's
 * providers, resolving with the slots it filled, and `onFlushed` nudges every request waiting
 * for a flush after one landed.
 */
export class FlusherImpl implements Flusher {
  private readonly runner: CoalescingRunner

  /** A lost race runs again at once, and any other failure is logged and ends the run until the next nudge or sweep. */
  constructor(runFlush: () => Promise<number>, onFlushed: () => Promise<void>, logger: Logger) {
    this.runner = new CoalescingRunner(async () => {
      const started = Date.now()
      logger.debug('flush started')
      let filled: number
      try {
        filled = await runFlush()
      } catch (error: unknown) {
        const fields = { durationMs: Date.now() - started, err: caughtError(error) }
        if (isLostRace(error)) {
          logger.debug('flush lost a race, running again', fields)
          return true
        }
        logger.error('flush failed', fields)
        return false
      }
      if (filled === 0) {
        logger.debug('nothing to flush', { durationMs: Date.now() - started })
        return false
      }
      logger.debug('flush landed', { count: filled, durationMs: Date.now() - started })
      // A flush carries at most the width, so more may wait behind a flush that landed.
      await onFlushed()
      return true
    })
  }

  flush(): Promise<void> {
    return this.runner.run()
  }
}

/**
 * A flush that another flush beat: it landed as `FailFallible` with its fee paid, or the build
 * tripped one of `flushQueue`'s asserts on an item the other flush had moved. `FailEntirely`
 * means the guaranteed section failed, which a rerun would repeat.
 */
function isLostRace(error: unknown): boolean {
  if (error instanceof CallTxFailedError) return error.finalizedTxData.status === FailFallible
  const refusal = circuitAssertMessage(error)
  return refusal !== undefined && FLUSH_RACE_ASSERTS.includes(refusal)
}

/** The `flushQueue` asserts an item another flush had already moved trips. */
const FLUSH_RACE_ASSERTS: readonly string[] = [
  'Request not queued',
  'Identical request open',
  'Attestation not queued',
]
