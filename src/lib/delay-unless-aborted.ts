import { setTimeout as delay } from 'node:timers/promises'

/** Resolves after the delay, or at once when the signal aborts, and holds no timer past either. */
export async function delayUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  try {
    await delay(ms, undefined, { signal })
  } catch (error: unknown) {
    if (!signal.aborted) throw error
  }
}
