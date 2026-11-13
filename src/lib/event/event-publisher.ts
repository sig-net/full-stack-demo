import type { Event } from '@/lib/event/event'

export interface EventPublisher {
  /**
   * Publishes the event. A transactional publisher writes it on the transaction open on the call
   * chain, so the event becomes visible exactly when that transaction commits.
   */
  publishEvent(event: Event): Promise<void>
}
