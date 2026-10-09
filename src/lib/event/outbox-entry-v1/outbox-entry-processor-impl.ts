import 'server-only'

import type { Pool } from 'pg'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { delayUnlessAborted } from '@/lib/delay-unless-aborted'
import { eventSchema } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { OutboxEntryProcessor } from '@/lib/event/outbox-entry-v1/outbox-entry-processor'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'

const BATCH_SIZE = 100

export class OutboxEntryProcessorImpl implements OutboxEntryProcessor {
  private readonly outboxEntryRepository: OutboxEntryRepository
  private readonly kafkaEventPublisher: EventPublisher
  private readonly unitOfWork: UnitOfWork
  private running: Promise<void> | undefined
  private runAgain = false

  constructor(
    outboxEntryRepository: OutboxEntryRepository,
    kafkaEventPublisher: EventPublisher,
    unitOfWork: UnitOfWork,
  ) {
    this.outboxEntryRepository = outboxEntryRepository
    this.kafkaEventPublisher = kafkaEventPublisher
    this.unitOfWork = unitOfWork
  }

  process(): Promise<void> {
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
      while ((await this.relayBatch()) === BATCH_SIZE);
    } while (this.runAgain)
  }

  /**
   * Relays one locked batch and resolves with its size. The Kafka send happens inside the
   * transaction on purpose: an entry is marked sent only once the broker acknowledged it, so a
   * commit that fails afterwards relays the entry again and loses nothing.
   */
  private relayBatch(): Promise<number> {
    return this.unitOfWork.runInTransaction(async () => {
      const entries = await this.outboxEntryRepository.search({
        criteria: [{ type: 'bool', field: 'sent', bool: false }],
        order: { field: 'createdAt', direction: 'asc' },
        limit: BATCH_SIZE,
        lock: 'update-skip-locked',
      })
      for (const entry of entries) {
        await this.kafkaEventPublisher.publishEvent(
          eventSchema.parse(JSON.parse(new TextDecoder().decode(entry.data))),
        )
        await this.outboxEntryRepository.update({ ...entry, sent: true })
      }
      return entries.length
    })
  }
}

/** The channel the outbox table's insert trigger notifies. */
const NOTIFY_CHANNEL = 'event_outbox'
const SWEEP_INTERVAL_MS = 30_000
const RESTART_DELAY_MS = 5_000

/**
 * Relays the outbox until the signal aborts, restarting after a failure. The pool supplies the
 * dedicated connection that listens for the table's notifications. Resolves once that connection
 * is released and the relay that was in flight at the abort has ended.
 */
export async function runOutboxEntryProcessor(
  processor: OutboxEntryProcessor,
  pool: Pool,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await listenAndSweep(processor, pool, signal)
    } catch (error: unknown) {
      if (!signal.aborted) console.error('Outbox entry processor failed, restarting', error)
    }
    await delayUnlessAborted(RESTART_DELAY_MS, signal)
  }
}

async function listenAndSweep(
  processor: OutboxEntryProcessor,
  pool: Pool,
  signal: AbortSignal,
): Promise<void> {
  const client = await pool.connect()
  let inFlight: Promise<void> = Promise.resolve()
  try {
    const run = (): void => {
      inFlight = processor.process().catch((error: unknown) => {
        console.error('Outbox entry processing failed', error)
      })
    }
    client.on('notification', run)
    await client.query(`LISTEN ${NOTIFY_CHANNEL}`)
    // Notifications are not durable, so a sweep catches entries written while unlistened and
    // entries whose relay failed.
    while (!signal.aborted) {
      run()
      await delayUnlessAborted(SWEEP_INTERVAL_MS, signal)
    }
  } finally {
    client.release(true)
    await inFlight
  }
}
