import 'server-only'

import { setTimeout as delay } from 'node:timers/promises'

import { MessagesStreamFallbackModes, MessagesStreamModes } from '@platformatic/kafka'

import { type Event, eventSchema, EVENTS_TOPIC } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'
import type { EventConsumerHub } from '@/lib/event/event-consumer-hub'
import type { StringConsumer } from '@/lib/kafka/clients'

export class EventConsumerHubImpl implements EventConsumerHub {
  private readonly consumers: EventConsumer[] = []

  registerConsumer(consumer: EventConsumer): void {
    this.consumers.push(consumer)
  }

  /** Handlers run outside any transaction: the resolver behind each one opens its own writes. */
  async dispatchEvent(event: Event): Promise<void> {
    for (const consumer of this.consumers) {
      if (consumer.wantsEvent(event)) await consumer.handleEvent(event)
    }
  }
}

/** The consumer group every replica of the application joins. */
export const EVENTS_GROUP_ID = 'full-stack-demo.events'
const RESTART_DELAY_MS = 5_000

async function consumeEvents(hub: EventConsumerHub, consumer: StringConsumer): Promise<void> {
  try {
    const stream = await consumer.consume({
      topics: [EVENTS_TOPIC],
      mode: MessagesStreamModes.COMMITTED,
      fallbackMode: MessagesStreamFallbackModes.EARLIEST,
      autocommit: false,
    })
    for await (const record of stream) {
      const parsed = eventSchema.safeParse(JSON.parse(record.value))
      if (parsed.success) {
        // A failing handler leaves the offset uncommitted, so the record is redelivered after
        // the restart delay and handlers must be idempotent.
        await hub.dispatchEvent(parsed.data)
      } else {
        console.error(
          `Event at ${record.partition}:${record.offset.toString()} is malformed and was skipped`,
        )
      }
      await record.commit()
    }
  } finally {
    await consumer.close(true)
  }
}

/**
 * Consumes the events topic for the life of the server process, restarting after a failure with
 * a consumer from `createConsumer`.
 */
export function startEventConsumerHub(
  hub: EventConsumerHub,
  createConsumer: () => StringConsumer,
): void {
  void (async (): Promise<never> => {
    for (;;) {
      try {
        await consumeEvents(hub, createConsumer())
      } catch (error: unknown) {
        console.error('Event consumer hub failed, restarting', error)
      }
      await delay(RESTART_DELAY_MS)
    }
  })()
}
