import 'server-only'

import { z } from 'zod'

import type { ClientConfig } from '@/lib/config/client-config'
import { ethereumConfigFromEnv, ethereumEnvSchema } from '@/lib/config/ethereum-config'
import { type KafkaConfig, kafkaConfigFromEnv, kafkaEnvSchema } from '@/lib/config/kafka-config'
import {
  midnightNetworkConfigFromEnv,
  midnightNetworkEnvSchema,
} from '@/lib/config/midnight-network-config'
import {
  type MidnightProverConfig,
  midnightProverConfigFromEnv,
  midnightProverEnvSchema,
} from '@/lib/config/midnight-prover-config'
import {
  type MidnightRelayerConfig,
  midnightRelayerConfigFromEnv,
  midnightRelayerEnvSchema,
} from '@/lib/config/midnight-relayer-config'
import {
  type MidnightRespondOutputConfig,
  midnightRespondOutputConfigFromEnv,
  midnightRespondOutputEnvSchema,
} from '@/lib/config/midnight-respond-output-config'
import {
  midnightSignetConfigFromEnv,
  midnightSignetEnvSchema,
} from '@/lib/config/midnight-signet-config'
import {
  midnightEthereumErc20VaultConfigFromEnv,
  midnightEthereumErc20VaultEnvSchema,
} from '@/lib/config/midnight-ethereum-erc20-vault-config'

export interface ServerOnlyConfig {
  readonly dbConnectionString: string
  readonly kafka: KafkaConfig
  readonly midnightProver: MidnightProverConfig
  readonly midnightRelayer: MidnightRelayerConfig
  readonly midnightRespondOutput: MidnightRespondOutputConfig
}

export interface ServerConfig {
  readonly serverOnly: ServerOnlyConfig
  readonly client: ClientConfig
}

const envSchema = z.object({
  DB_CONNECTION_STRING: z.string().min(1),
  ...kafkaEnvSchema.shape,
  ...midnightProverEnvSchema.shape,
  ...midnightRelayerEnvSchema.shape,
  ...midnightRespondOutputEnvSchema.shape,
  ...midnightNetworkEnvSchema.shape,
  ...midnightSignetEnvSchema.shape,
  ...midnightEthereumErc20VaultEnvSchema.shape,
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
    serverOnly: {
      dbConnectionString: env.DB_CONNECTION_STRING,
      kafka: kafkaConfigFromEnv(env),
      midnightProver: midnightProverConfigFromEnv(env),
      midnightRelayer: midnightRelayerConfigFromEnv(env),
      midnightRespondOutput: midnightRespondOutputConfigFromEnv(env),
    },
    client: {
      midnightNetwork,
      midnightSignet: midnightSignetConfigFromEnv(midnightNetwork.networkId, env),
      midnightEthereumErc20Vault: midnightEthereumErc20VaultConfigFromEnv(
        midnightNetwork.networkId,
        env,
      ),
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
