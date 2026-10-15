import 'server-only'

import type { Pool } from 'pg'

import { CoalescingRunner } from '@/lib/coalescing-runner'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { delayUnlessAborted } from '@/lib/delay-unless-aborted'
import { eventSchema } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { OutboxEntryProcessor } from '@/lib/event/outbox-entry-v1/outbox-entry-processor'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'
import { caughtError, type Logger } from '@/lib/logging/logger'
import { runUntilAborted } from '@/lib/run-until-aborted'

const BATCH_SIZE = 100

export class OutboxEntryProcessorImpl implements OutboxEntryProcessor {
  private readonly outboxEntryRepository: OutboxEntryRepository
  private readonly kafkaEventPublisher: EventPublisher
  private readonly unitOfWork: UnitOfWork
  private readonly logger: Logger
  private readonly runner: CoalescingRunner

  /** A full batch means more may wait, so the relay goes again at once. */
  constructor(
    outboxEntryRepository: OutboxEntryRepository,
    kafkaEventPublisher: EventPublisher,
    unitOfWork: UnitOfWork,
    logger: Logger,
  ) {
    this.outboxEntryRepository = outboxEntryRepository
    this.kafkaEventPublisher = kafkaEventPublisher
    this.unitOfWork = unitOfWork
    this.logger = logger
    this.runner = new CoalescingRunner(async () => (await this.relayBatch()) === BATCH_SIZE)
  }

  process(): Promise<void> {
    return this.runner.run()
  }

  /**
   * Relays one locked batch and resolves with its size. The Kafka send happens inside the
   * transaction on purpose: an entry is marked sent only once the broker acknowledged it, so a
   * commit that fails afterwards relays the entry again and loses nothing.
   */
  private async relayBatch(): Promise<number> {
    const count = await this.unitOfWork.runInTransaction(async () => {
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
    if (count > 0) this.logger.debug('outbox batch relayed', { count })
    return count
  }
}

/** The channel the outbox table's insert trigger notifies. */
const NOTIFY_CHANNEL = 'event_outbox'
const SWEEP_INTERVAL_MS = 30_000

/**
 * Relays the outbox until the signal aborts, restarting after a failure. The pool supplies the
 * dedicated connection that listens for the table's notifications. Resolves once that connection
 * is released and the relay that was in flight at the abort has ended.
 */
export function runOutboxEntryProcessor(
  processor: OutboxEntryProcessor,
  pool: Pool,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  return runUntilAborted(() => listenAndSweep(processor, pool, signal, logger), signal, logger)
}

async function listenAndSweep(
  processor: OutboxEntryProcessor,
  pool: Pool,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  const client = await pool.connect()
  let inFlight: Promise<void> = Promise.resolve()
  try {
    const run = (): void => {
      inFlight = processor.process().catch((error: unknown) => {
        logger.error('outbox relay failed', { err: caughtError(error) })
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
