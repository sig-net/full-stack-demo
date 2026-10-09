import { delayUnlessAborted } from '@/lib/delay-unless-aborted'

/**
 * Runs every task in order, waits the interval, and goes again until the signal aborts. A task's
 * failure is logged under its name and the pass goes on to the next task. An abort ends the pass
 * after the task that is running, and the returned promise resolves once that task has returned.
 */
export async function sweep(
  tasks: readonly SweepTask[],
  intervalMs: number,
  signal: AbortSignal,
): Promise<void> {
  let passes = 0
  while (!signal.aborted) {
    const started = Date.now()
    for (const task of tasks) {
      if (signal.aborted) return
      try {
        await task.run()
      } catch (error: unknown) {
        console.error(`Sweep task ${task.name} failed`, error)
      }
    }
    passes += 1
    if (passes === 1) {
      console.log(
        `Sweep ran its first pass in ${String(Date.now() - started)} ms and runs every ${String(intervalMs)} ms`,
      )
    }
    await delayUnlessAborted(intervalMs, signal)
  }
}

export interface SweepTask {
  /** Names the task in the log line of a failure. */
  readonly name: string
  readonly run: () => Promise<void>
}
