import 'server-only'

import { MessagesStreamFallbackModes, MessagesStreamModes } from '@platformatic/kafka'

import { type Event, eventSchema, EVENTS_TOPIC } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'
import type { EventConsumerHub } from '@/lib/event/event-consumer-hub'
import type { StringConsumer } from '@/lib/kafka/clients'
import { caughtError, type Logger } from '@/lib/logging/logger'
import { runUntilAborted } from '@/lib/run-until-aborted'

export class EventConsumerHubImpl implements EventConsumerHub {
  private readonly consumers: EventConsumer[] = []
  private readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  registerConsumer(consumer: EventConsumer): void {
    this.consumers.push(consumer)
  }

  /** Handlers run outside any transaction: the resolver behind each one opens its own writes. */
  async dispatchEvent(event: Event): Promise<void> {
    const started = Date.now()
    let count = 0
    for (const consumer of this.consumers) {
      if (!consumer.wantsEvent(event)) continue
      count += 1
      await consumer.handleEvent(event)
    }
    this.logger.debug('event dispatched', {
      event: event.type,
      eventId: event.id,
      count,
      durationMs: Date.now() - started,
    })
  }
}

/** The consumer group every replica of the application joins. */
export const EVENTS_GROUP_ID = 'full-stack-demo.events'

/**
 * Consumes the events topic until the signal aborts, restarting after a failure with a consumer
 * from `createConsumer`. Resolves once the last consumer is closed and the handler that was
 * mid-dispatch at the abort has returned.
 */
export function runEventConsumerHub(
  hub: EventConsumerHub,
  createConsumer: () => StringConsumer,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  return runUntilAborted(() => consumeEvents(hub, createConsumer(), signal, logger), signal, logger)
}

/** Closing the consumer ends the stream, which ends the loop once the record in hand is handled. */
async function consumeEvents(
  hub: EventConsumerHub,
  consumer: StringConsumer,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => (closing ??= consumer.close(true))
  const onAbort = (): void => {
    close().catch((error: unknown) => {
      logger.error('closing the event consumer failed', { err: caughtError(error) })
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
      const position = { partition: record.partition, offset: record.offset }
      if (parsed.success) {
        const event = parsed.data
        logger.debug('event received', {
          event: event.type,
          eventId: event.id,
          key: event.key,
          ...position,
        })
        // A failing handler leaves the offset uncommitted, so the record is redelivered after
        // the restart delay and handlers must be idempotent.
        await hub.dispatchEvent(event)
      } else {
        logger.error('malformed event skipped', position)
      }
      if (signal.aborted) break
      await record.commit()
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    await close()
  }
}
