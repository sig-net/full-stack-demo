import 'server-only'

import { type Event, EVENTS_TOPIC } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { StringProducer } from '@/lib/kafka/clients'
import type { Logger } from '@/lib/logging/logger'

/** Publishes straight to Kafka. Resolves once the broker has acknowledged the record. */
export class EventPublisherKafkaImpl implements EventPublisher {
  private readonly producer: StringProducer
  private readonly logger: Logger

  constructor(producer: StringProducer, logger: Logger) {
    this.producer = producer
    this.logger = logger
  }

  async publishEvent(event: Event): Promise<void> {
    await this.producer.send({
      messages: [{ topic: EVENTS_TOPIC, key: event.key, value: JSON.stringify(event) }],
    })
    this.logger.debug('event sent', { event: event.type, eventId: event.id, key: event.key })
  }
}
