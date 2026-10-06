export async function register(): Promise<void> {
  // The Kafka client needs Node.js sockets, which the edge runtime lacks.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startExampleMessageConsumer } =
      await import('@/lib/example-messages/example-message-consumer')
    startExampleMessageConsumer()
  }
}
