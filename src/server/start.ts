import 'server-only'

import { EVENTS_GROUP_ID, startEventConsumerHub } from '@/lib/event/event-consumer-hub-impl'
import { startOutboxEntryProcessor } from '@/lib/event/outbox-entry-v1/outbox-entry-processor-impl'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'
import { getBackend } from '@/server/backend'

/**
 * Starts the long-running work of the server process. Consumers are registered here, before the
 * hub starts, on the instrumentation module graph's backend: the request graph's never consumes.
 */
export async function startBackend(): Promise<void> {
  const { db, kafka, event, midnight } = await getBackend()
  startRelayerWallet(midnight.relayerWallet)
  event.consumerHub.registerConsumer(midnight.transactionV1.eventConsumer)
  startEventConsumerHub(event.consumerHub, () => kafka.createConsumer(EVENTS_GROUP_ID))
  startOutboxEntryProcessor(event.outboxEntryV1.processor, db.pool)
}

/**
 * Begins the wallet's sync at once, since a sync can take minutes. The server starts without
 * waiting, and a resolver that reaches the wallet before the sync ends waits on it.
 */
function startRelayerWallet(relayerWallet: RelayerWallet): void {
  const started = Date.now()
  relayerWallet.start().then(
    () => {
      console.log(`Relayer wallet synced in ${String(Date.now() - started)} ms`)
    },
    (error: unknown) => {
      console.error('Relayer wallet failed to start; the next relayer transaction retries', error)
    },
  )
}
