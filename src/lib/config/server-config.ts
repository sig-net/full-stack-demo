import 'server-only'

import { z } from 'zod'

import type { ClientConfig } from '@/lib/config/client-config'
import { environmentSchema } from '@/lib/config/environment'

export interface SecretConfig {
  readonly dbConnectionString: string
}

export interface ServerConfig {
  readonly secret: SecretConfig
  readonly client: ClientConfig
}

const envSchema = z.object({
  ENVIRONMENT: environmentSchema,
  NODE_URL: z.url(),
  DB_CONNECTION_STRING: z.string().min(1),
})

async function loadServerConfig(): Promise<ServerConfig> {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(`Invalid server configuration:\n${z.prettifyError(parsed.error)}`)
  }
  const env = parsed.data
  return {
    secret: { dbConnectionString: env.DB_CONNECTION_STRING },
    client: { environment: env.ENVIRONMENT, nodeURL: env.NODE_URL },
  }
}

// One load is shared by every request, and a rejected load is dropped so the next request retries.
let serverConfig: Promise<ServerConfig> | undefined

export function getServerConfig(): Promise<ServerConfig> {
  serverConfig ??= loadServerConfig().catch((error: unknown) => {
    serverConfig = undefined
    throw error
  })
  return serverConfig
}

export async function getClientConfig(): Promise<ClientConfig> {
  return (await getServerConfig()).client
}
