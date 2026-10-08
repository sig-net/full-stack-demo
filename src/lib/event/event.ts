import { z } from 'zod'

/**
 * A fact about a resource, published after the write that made it true. `data` names the
 * resource and never carries a secret: the handler loads the resource and acts on its state.
 */
export const eventSchema = z.object({
  id: z.uuid(),
  type: z.string().min(1),
  /** Events with the same key are delivered in the order they were published. */
  key: z.string().min(1),
  data: z.json(),
})

export type Event = z.infer<typeof eventSchema>

export function newEvent(type: string, key: string, data: Event['data']): Event {
  return { id: crypto.randomUUID(), type, key, data }
}

/** The Kafka topic every event travels on. */
export const EVENTS_TOPIC = 'full-stack-demo.events'
