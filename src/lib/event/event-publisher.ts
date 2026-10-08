import type { DatabaseExecutor } from '@/lib/db/database'
import type { Event } from '@/lib/event/event'

export interface EventPublisher {
  /**
   * Publishes the event. A transactional publisher writes it on `executor`, so the event becomes
   * visible exactly when the surrounding database transaction commits.
   */
  publishEvent(event: Event, executor?: DatabaseExecutor): Promise<void>
}
