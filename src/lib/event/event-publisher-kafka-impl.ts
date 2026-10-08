import 'server-only'

import { type Event, EVENTS_TOPIC } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import { getProducer, type StringProducer } from '@/lib/kafka/clients'
import { lazySingleton } from '@/lib/lazy-singleton'

/** Publishes straight to Kafka. Resolves once the broker has acknowledged the record. */
export class EventPublisherKafkaImpl implements EventPublisher {
  private readonly producer: StringProducer

  constructor(producer: StringProducer) {
    this.producer = producer
  }

  async publishEvent(event: Event): Promise<void> {
    await this.producer.send({
      messages: [{ topic: EVENTS_TOPIC, key: event.key, value: JSON.stringify(event) }],
    })
  }
}

/** One instance serves the whole server process. */
export const getKafkaEventPublisher: () => Promise<EventPublisher> = lazySingleton(
  async () => new EventPublisherKafkaImpl(await getProducer()),
)
