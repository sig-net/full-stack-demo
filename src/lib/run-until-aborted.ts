import { delayUnlessAborted } from '@/lib/delay-unless-aborted'

/**
 * Runs the work again after it ends or fails until the signal aborts, waiting the delay between
 * runs. A failure is logged under `name`. Resolves once the run in flight at the abort has ended.
 */
export async function runUntilAborted(
  name: string,
  work: () => Promise<void>,
  signal: AbortSignal,
  restartDelayMs = RESTART_DELAY_MS,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await work()
    } catch (error: unknown) {
      if (!signal.aborted) console.error(`${name} failed, restarting`, error)
    }
    await delayUnlessAborted(restartDelayMs, signal)
  }
}

const RESTART_DELAY_MS = 5_000
