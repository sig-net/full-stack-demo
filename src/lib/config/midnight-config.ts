import { z } from 'zod'

export const midnightNetworkIdSchema = z.enum([
  'undeployed',
  'stagenet',
  'preview',
  'preprod',
  'mainnet',
])

export type MidnightNetworkId = z.infer<typeof midnightNetworkIdSchema>

export interface MidnightConfig {
  readonly networkId: MidnightNetworkId
  readonly indexerURL: string
  readonly indexerWsURL: string
  readonly nodeURL: string
  readonly proofServerURL: string
}

const LOCAL_PROOF_SERVER_URL = 'http://127.0.0.1:6300'

/** Public endpoints of each network. The proof server always runs beside the application. */
export const MIDNIGHT_NETWORK_DEFAULTS: Readonly<Record<MidnightNetworkId, MidnightConfig>> = {
  undeployed: {
    networkId: 'undeployed',
    indexerURL: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWsURL: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    nodeURL: 'http://127.0.0.1:9944',
    proofServerURL: LOCAL_PROOF_SERVER_URL,
  },
  stagenet: {
    networkId: 'stagenet',
    indexerURL: 'https://indexer.stagenet.shielded.tools/api/v4/graphql',
    indexerWsURL: 'wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws',
    nodeURL: 'https://rpc.stagenet.shielded.tools',
    proofServerURL: LOCAL_PROOF_SERVER_URL,
  },
  preview: {
    networkId: 'preview',
    indexerURL: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWsURL: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    nodeURL: 'https://rpc.preview.midnight.network',
    proofServerURL: LOCAL_PROOF_SERVER_URL,
  },
  preprod: {
    networkId: 'preprod',
    indexerURL: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsURL: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    nodeURL: 'https://rpc.preprod.midnight.network',
    proofServerURL: LOCAL_PROOF_SERVER_URL,
  },
  mainnet: {
    networkId: 'mainnet',
    indexerURL: 'https://indexer.mainnet.midnight.network/api/v4/graphql',
    indexerWsURL: 'wss://indexer.mainnet.midnight.network/api/v4/graphql/ws',
    nodeURL: 'https://rpc.mainnet.midnight.network',
    proofServerURL: LOCAL_PROOF_SERVER_URL,
  },
}

const httpURL = z.url({ protocol: /^https?$/ })
const wsURL = z.url({ protocol: /^wss?$/ })
const nodeURL = z.url({ protocol: /^(https?|wss?)$/ })

/** The network selects the defaults; each URL variable overrides one endpoint when set. */
export const midnightEnvSchema = z.object({
  MIDNIGHT_NETWORK_ID: midnightNetworkIdSchema,
  MIDNIGHT_INDEXER_URL: httpURL.optional(),
  MIDNIGHT_INDEXER_WS_URL: wsURL.optional(),
  MIDNIGHT_NODE_URL: nodeURL.optional(),
  MIDNIGHT_PROOF_SERVER_URL: httpURL.optional(),
})

export type MidnightEnv = z.infer<typeof midnightEnvSchema>

export function midnightConfigFromEnv(env: MidnightEnv): MidnightConfig {
  const defaults = MIDNIGHT_NETWORK_DEFAULTS[env.MIDNIGHT_NETWORK_ID]
  return {
    networkId: env.MIDNIGHT_NETWORK_ID,
    indexerURL: env.MIDNIGHT_INDEXER_URL ?? defaults.indexerURL,
    indexerWsURL: env.MIDNIGHT_INDEXER_WS_URL ?? defaults.indexerWsURL,
    nodeURL: env.MIDNIGHT_NODE_URL ?? defaults.nodeURL,
    proofServerURL: env.MIDNIGHT_PROOF_SERVER_URL ?? defaults.proofServerURL,
  }
}
