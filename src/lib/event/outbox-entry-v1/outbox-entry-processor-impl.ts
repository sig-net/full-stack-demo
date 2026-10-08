import 'server-only'

import { setTimeout as delay } from 'node:timers/promises'

import { getDatabasePool } from '@/lib/db/database'
import { runInTransaction } from '@/lib/db/unit-of-work'
import { eventSchema } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import { getKafkaEventPublisher } from '@/lib/event/event-publisher-kafka-impl'
import type { OutboxEntryProcessor } from '@/lib/event/outbox-entry-v1/outbox-entry-processor'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'
import { getOutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository-sql-impl'
import { lazySingleton } from '@/lib/lazy-singleton'

const BATCH_SIZE = 100

export class OutboxEntryProcessorImpl implements OutboxEntryProcessor {
  private readonly outboxEntryRepository: OutboxEntryRepository
  private readonly kafkaEventPublisher: EventPublisher
  private running: Promise<void> | undefined
  private runAgain = false

  constructor(outboxEntryRepository: OutboxEntryRepository, kafkaEventPublisher: EventPublisher) {
    this.outboxEntryRepository = outboxEntryRepository
    this.kafkaEventPublisher = kafkaEventPublisher
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
    return runInTransaction(async () => {
      const entries = await this.outboxEntryRepository.listUnsentOutboxEntries(BATCH_SIZE)
      for (const entry of entries) {
        await this.kafkaEventPublisher.publishEvent(
          eventSchema.parse(JSON.parse(new TextDecoder().decode(entry.data))),
        )
        await this.outboxEntryRepository.updateOutboxEntry({ ...entry, sent: true })
      }
      return entries.length
    })
  }
}

/** One instance serves the whole server process. */
export const getOutboxEntryProcessor: () => Promise<OutboxEntryProcessor> = lazySingleton(
  async () =>
    new OutboxEntryProcessorImpl(await getOutboxEntryRepository(), await getKafkaEventPublisher()),
)

/** The channel the outbox table's insert trigger notifies. */
const NOTIFY_CHANNEL = 'event_outbox'
const SWEEP_INTERVAL_MS = 30_000
const RESTART_DELAY_MS = 5_000

async function listenAndSweep(processor: OutboxEntryProcessor): Promise<never> {
  const client = await (await getDatabasePool()).connect()
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

/** Relays the outbox for the life of the server process, restarting after a failure. */
export function startOutboxEntryProcessor(): void {
  void (async (): Promise<never> => {
    for (;;) {
      try {
        await listenAndSweep(await getOutboxEntryProcessor())
      } catch (error: unknown) {
        console.error('Outbox entry processor failed, restarting', error)
      }
      await delay(RESTART_DELAY_MS)
    }
  })()
}
