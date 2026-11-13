import { delayUnlessAborted } from '@/lib/delay-unless-aborted'
import { caughtError, type Logger } from '@/lib/logging/logger'

/**
 * Runs the work again after it ends or fails until the signal aborts, waiting the delay between
 * runs. A failure is logged at error through `logger`. Resolves once the run in flight at the
 * abort has ended.
 */
export async function runUntilAborted(
  work: () => Promise<void>,
  signal: AbortSignal,
  logger: Logger,
  restartDelayMs = RESTART_DELAY_MS,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await work()
    } catch (error: unknown) {
      if (!signal.aborted) logger.error('loop failed, restarting', { err: caughtError(error) })
    }
    await delayUnlessAborted(restartDelayMs, signal)
  }
}

const RESTART_DELAY_MS = 5_000
