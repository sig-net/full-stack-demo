import 'server-only'

import { setTimeout as delay } from 'node:timers/promises'

import type { Pool } from 'pg'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
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
   * commit that fails afterwards relays the entry again rather than losing it.
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

async function listenAndSweep(processor: OutboxEntryProcessor, pool: Pool): Promise<never> {
  const client = await pool.connect()
  try {
    const run = (): void => {
      processor.process().catch((error: unknown) => {
        console.error('Outbox entry processing failed', error)
      })
    }
    client.on('notification', run)
    await client.query(`LISTEN ${NOTIFY_CHANNEL}`)
    // Notifications are not durable, so a sweep catches entries written while unlistened and
    // entries whose relay failed.
    for (;;) {
      run()
      await delay(SWEEP_INTERVAL_MS)
    }
  } finally {
    client.release(true)
  }
}

/**
 * Relays the outbox for the life of the server process, restarting after a failure. The pool
 * supplies the dedicated connection that listens for the table's notifications.
 */
export function startOutboxEntryProcessor(processor: OutboxEntryProcessor, pool: Pool): void {
  void (async (): Promise<never> => {
    for (;;) {
      try {
        await listenAndSweep(processor, pool)
      } catch (error: unknown) {
        console.error('Outbox entry processor failed, restarting', error)
      }
      await delay(RESTART_DELAY_MS)
    }
  })()
}
