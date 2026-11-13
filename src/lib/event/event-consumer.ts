import type { Event } from '@/lib/event/event'

export interface EventConsumer {
  wantsEvent(event: Event): boolean
  /**
   * Handles an event the consumer wants. Delivery is at least once, so handling must be
   * idempotent: load the resource the event names and act on its current state.
   */
  handleEvent(event: Event): Promise<void>
}
