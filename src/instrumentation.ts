export async function register(): Promise<void> {
  // The Kafka and Postgres clients need Node.js sockets, which the edge runtime lacks.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBackend } = await import('@/server/start')
    await startBackend()
  }
}
