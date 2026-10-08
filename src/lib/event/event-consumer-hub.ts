import type { Event } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'

/** Owns the consumers of the server process and hands every event to the ones that want it. */
export interface EventConsumerHub {
  registerConsumer(consumer: EventConsumer): void
  /** Resolves once every consumer that wants the event has handled it, in registration order. */
  dispatchEvent(event: Event): Promise<void>
}
