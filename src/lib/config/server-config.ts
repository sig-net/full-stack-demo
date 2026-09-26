import 'server-only'

import { z } from 'zod'

import type { ClientConfig } from '@/lib/config/client-config'
import { ethereumConfigFromEnv, ethereumEnvSchema } from '@/lib/config/ethereum-config'
import {
  midnightNetworkConfigFromEnv,
  midnightNetworkEnvSchema,
} from '@/lib/config/midnight-network-config'
import {
  midnightSignetConfigFromEnv,
  midnightSignetEnvSchema,
} from '@/lib/config/midnight-signet-config'
import {
  midnightVaultConfigFromEnv,
  midnightVaultEnvSchema,
} from '@/lib/config/midnight-vault-config'

export interface SecretConfig {
  readonly dbConnectionString: string
}

export interface ServerConfig {
  readonly secret: SecretConfig
  readonly client: ClientConfig
}

const envSchema = z.object({
  DB_CONNECTION_STRING: z.string().min(1),
  ...midnightNetworkEnvSchema.shape,
  ...midnightSignetEnvSchema.shape,
  ...midnightVaultEnvSchema.shape,
  ...ethereumEnvSchema.shape,
})

async function loadServerConfig(): Promise<ServerConfig> {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(`Invalid server configuration:\n${z.prettifyError(parsed.error)}`)
  }
  const env = parsed.data
  const midnightNetwork = midnightNetworkConfigFromEnv(env)
  return {
    secret: { dbConnectionString: env.DB_CONNECTION_STRING },
    client: {
      midnightNetwork,
      midnightSignet: midnightSignetConfigFromEnv(midnightNetwork.networkId, env),
      midnightVault: midnightVaultConfigFromEnv(midnightNetwork.networkId, env),
      ethereum: ethereumConfigFromEnv(env),
    },
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
