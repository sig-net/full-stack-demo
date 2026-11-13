import { delayUnlessAborted } from '@/lib/delay-unless-aborted'
import { caughtError, type Logger } from '@/lib/logging/logger'

/**
 * Runs every task in order, waits the interval, and goes again until the signal aborts. A task's
 * failure is logged under its name and the pass goes on to the next task. An abort ends the pass
 * after the task that is running, and the returned promise resolves once that task has returned.
 */
export async function sweep(
  tasks: readonly SweepTask[],
  intervalMs: number,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  let passes = 0
  while (!signal.aborted) {
    const started = Date.now()
    for (const task of tasks) {
      if (signal.aborted) return
      const taskStarted = Date.now()
      try {
        await task.run()
        logger.debug('sweep task ran', { task: task.name, durationMs: Date.now() - taskStarted })
      } catch (error: unknown) {
        logger.error('sweep task failed', {
          task: task.name,
          durationMs: Date.now() - taskStarted,
          err: caughtError(error),
        })
      }
    }
    passes += 1
    const durationMs = Date.now() - started
    logger.debug('sweep pass ended', { count: tasks.length, durationMs })
    if (passes === 1) logger.info('sweep running', { durationMs, intervalMs })
    await delayUnlessAborted(intervalMs, signal)
  }
}

export interface SweepTask {
  /** Names the task in its log lines. */
  readonly name: string
  readonly run: () => Promise<void>
}
