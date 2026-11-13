import 'server-only'

import { getBackend } from '@/server/backend'
import { bridgeConsole } from '@/server/console-bridge'

/** What instrumentation calls once per server process. */
export async function startBackend(): Promise<void> {
  const backend = await getBackend()
  // A json line per console call keeps Cloud Logging's one-entry-per-line parsing intact.
  if (backend.config.serverOnly.logging.format === 'json') {
    bridgeConsole(backend.logging.logger.child({ component: 'console' }))
  }
  await backend.start()
}
