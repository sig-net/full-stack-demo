export async function register(): Promise<void> {
  // The Kafka and Postgres clients need Node.js sockets, which the edge runtime lacks.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ startEventConsumerHub }, { startOutboxEntryProcessor }] = await Promise.all([
      import('@/lib/event/event-consumer-hub-impl'),
      import('@/lib/event/outbox-entry-v1/outbox-entry-processor-impl'),
    ])
    // Consumers are registered here, before the hub starts: request code runs in a separate
    // module graph with its own hub instance, which never consumes.
    startEventConsumerHub()
    startOutboxEntryProcessor()
  }
}
