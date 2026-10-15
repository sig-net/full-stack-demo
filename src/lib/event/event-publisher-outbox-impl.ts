import 'server-only'

import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import { outboxEntryName } from '@/lib/event/outbox-entry-v1/outbox-entry'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'
import type { Logger } from '@/lib/logging/logger'

/** Publishes by writing an outbox entry, which the outbox entry processor relays to Kafka. */
export class EventPublisherOutboxImpl implements EventPublisher {
  private readonly outboxEntryRepository: OutboxEntryRepository
  private readonly logger: Logger

  constructor(outboxEntryRepository: OutboxEntryRepository, logger: Logger) {
    this.outboxEntryRepository = outboxEntryRepository
    this.logger = logger
  }

  async publishEvent(event: Event): Promise<void> {
    await this.outboxEntryRepository.create({
      name: outboxEntryName(event.id),
      type: event.type,
      data: new TextEncoder().encode(JSON.stringify(event)),
      sent: false,
      createdAt: new Date(),
    })
    this.logger.debug('event queued', { event: event.type, eventId: event.id, key: event.key })
  }
}
