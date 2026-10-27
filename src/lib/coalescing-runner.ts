/**
 * Runs one piece of work at a time. A call during a run asks for one more run after it, and
 * every caller waits for the run that covers its call. The work resolves true to run once more
 * at once, and a failure ends the runs and rejects every waiting caller.
 */
export class CoalescingRunner {
  private readonly work: () => Promise<boolean>
  private running: Promise<void> | undefined
  private runAgain = false

  constructor(work: () => Promise<boolean>) {
    this.work = work
  }

  run(): Promise<void> {
    if (this.running) {
      this.runAgain = true
      return this.running
    }
    this.running = this.runUntilDrained().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  private async runUntilDrained(): Promise<void> {
    do {
      this.runAgain = false
      if (await this.work()) this.runAgain = true
    } while (this.runAgain)
  }
}
