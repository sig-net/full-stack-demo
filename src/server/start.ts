import 'server-only'

import { getBackend } from '@/server/backend'

/** What instrumentation calls once per server process. */
export async function startBackend(): Promise<void> {
  await (await getBackend()).start()
}
