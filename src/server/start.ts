import 'server-only'

import { EVENTS_GROUP_ID, startEventConsumerHub } from '@/lib/event/event-consumer-hub-impl'
import { startOutboxEntryProcessor } from '@/lib/event/outbox-entry-v1/outbox-entry-processor-impl'
import { getBackend } from '@/server/backend'

/**
 * Starts the long-running work of the server process. Consumers are registered here, before the
 * hub starts, on the instrumentation module graph's backend: the request graph's never consumes.
 */
export async function startBackend(): Promise<void> {
  const { db, kafka, event, midnight } = await getBackend()
  event.consumerHub.registerConsumer(midnight.transactionV1.eventConsumer)
  startEventConsumerHub(event.consumerHub, () => kafka.createConsumer(EVENTS_GROUP_ID))
  startOutboxEntryProcessor(event.outboxEntryV1.processor, db.pool)
}
