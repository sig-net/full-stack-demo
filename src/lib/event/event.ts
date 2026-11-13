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

/** One event type with its data schema, typed for the publisher and parsed for the consumer. */
export interface EventDefinition<Data extends Event['data']> {
  readonly type: string
  create(key: string, data: Data): Event
  matches(event: Event): boolean
  /** The boundary: event data arrives from the bus and is untrusted until parsed. */
  parse(event: Event): z.ZodSafeParseResult<Data>
}

export function defineEvent<Data extends Event['data']>(
  type: string,
  dataSchema: z.ZodType<Data>,
): EventDefinition<Data> {
  return {
    type,
    create: (key, data) => newEvent(type, key, data),
    matches: (event) => event.type === type,
    parse: (event) => dataSchema.safeParse(event.data),
  }
}

/** The Kafka topic every event travels on. */
export const EVENTS_TOPIC = 'full-stack-demo.events'
