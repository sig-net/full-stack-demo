import 'server-only'

import { MessagesStreamFallbackModes, MessagesStreamModes } from '@platformatic/kafka'

import { delayUnlessAborted } from '@/lib/delay-unless-aborted'
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

/**
 * Consumes the events topic until the signal aborts, restarting after a failure with a consumer
 * from `createConsumer`. Resolves once the last consumer is closed and the handler that was
 * mid-dispatch at the abort has returned.
 */
export async function runEventConsumerHub(
  hub: EventConsumerHub,
  createConsumer: () => StringConsumer,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await consumeEvents(hub, createConsumer(), signal)
    } catch (error: unknown) {
      if (!signal.aborted) console.error('Event consumer hub failed, restarting', error)
    }
    await delayUnlessAborted(RESTART_DELAY_MS, signal)
  }
}

/** Closing the consumer ends the stream, which ends the loop once the record in hand is handled. */
async function consumeEvents(
  hub: EventConsumerHub,
  consumer: StringConsumer,
  signal: AbortSignal,
): Promise<void> {
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => (closing ??= consumer.close(true))
  const onAbort = (): void => {
    close().catch((error: unknown) => {
      console.error('Closing the event consumer failed', error)
    })
  }
  signal.addEventListener('abort', onAbort, { once: true })
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
      if (signal.aborted) break
      await record.commit()
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    await close()
  }
}
