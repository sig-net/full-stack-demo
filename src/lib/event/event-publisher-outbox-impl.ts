import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import { outboxEntryName } from '@/lib/event/outbox-entry-v1/outbox-entry'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'
import { getOutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository-sql-impl'
import { lazySingleton } from '@/lib/lazy-singleton'

/** Publishes by writing an outbox entry, which the outbox entry processor relays to Kafka. */
export class EventPublisherOutboxImpl implements EventPublisher {
  private readonly outboxEntryRepository: OutboxEntryRepository

  constructor(outboxEntryRepository: OutboxEntryRepository) {
    this.outboxEntryRepository = outboxEntryRepository
  }

  async publishEvent(event: Event, executor?: DatabaseExecutor): Promise<void> {
    await this.outboxEntryRepository.createOutboxEntry(
      {
        name: outboxEntryName(event.id),
        type: event.type,
        data: new TextEncoder().encode(JSON.stringify(event)),
        sent: false,
        createdAt: new Date(),
      },
      executor,
    )
  }
}

/** One instance serves the whole server process. */
export const getOutboxEventPublisher: () => Promise<EventPublisher> = lazySingleton(
  async () => new EventPublisherOutboxImpl(await getOutboxEntryRepository()),
)
