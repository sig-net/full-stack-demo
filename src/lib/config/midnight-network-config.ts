import { MidnightNetwork } from '@sig-net/midnight'
import { z } from 'zod'

/**
 * The networks this application may be configured for. Preview and mainnet are refused until the
 * signet contracts and the vault are deployed there.
 */
export const midnightNetworkIdSchema = z.enum([MidnightNetwork.Undeployed, MidnightNetwork.Preprod])

export type MidnightNetworkId = z.infer<typeof midnightNetworkIdSchema>

export interface MidnightNetworkConfig {
  readonly networkId: MidnightNetworkId
  readonly indexerURL: string
  readonly indexerWsURL: string
  readonly nodeURL: string
  readonly proofServerURL: string
}

const LOCAL_PROOF_SERVER_URL = 'http://127.0.0.1:6300'

/**
 * Default endpoints of each network. The proof server always runs beside the application, and
 * preprod has no default node or indexer, since Blockfrost serves them only to a project token.
 */
export const MIDNIGHT_NETWORK_DEFAULTS = {
  [MidnightNetwork.Undeployed]: {
    networkId: MidnightNetwork.Undeployed,
    indexerURL: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWsURL: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    nodeURL: 'http://127.0.0.1:9944',
    proofServerURL: LOCAL_PROOF_SERVER_URL,
  },
  [MidnightNetwork.Preprod]: {
    networkId: MidnightNetwork.Preprod,
    proofServerURL: LOCAL_PROOF_SERVER_URL,
  },
} as const satisfies Readonly<
  Record<
    MidnightNetworkId,
    Pick<MidnightNetworkConfig, 'networkId' | 'proofServerURL'> & Partial<MidnightNetworkConfig>
  >
>

const httpURL = z.url({ protocol: /^https?$/ })
const wsURL = z.url({ protocol: /^wss?$/ })
const nodeURL = z.url({ protocol: /^(https?|wss?)$/ })

/**
 * The network selects the defaults, and each URL variable overrides one endpoint when set. A
 * network without a default endpoint requires its variable.
 */
export const midnightNetworkEnvSchema = z.object({
  MIDNIGHT_NETWORK_ID: midnightNetworkIdSchema,
  MIDNIGHT_INDEXER_URL: httpURL.optional(),
  MIDNIGHT_INDEXER_WS_URL: wsURL.optional(),
  MIDNIGHT_NODE_URL: nodeURL.optional(),
  MIDNIGHT_PROOF_SERVER_URL: httpURL.optional(),
})

export type MidnightNetworkEnv = z.infer<typeof midnightNetworkEnvSchema>

export function midnightNetworkConfigFromEnv(env: MidnightNetworkEnv): MidnightNetworkConfig {
  const networkId = env.MIDNIGHT_NETWORK_ID
  const defaults: Partial<MidnightNetworkConfig> = MIDNIGHT_NETWORK_DEFAULTS[networkId]
  const required = (variable: keyof MidnightNetworkEnv, value: string | undefined): string => {
    if (value === undefined) {
      throw new Error(`${variable} is required: the ${networkId} network has no default for it`)
    }
    return value
  }
  return {
    networkId,
    indexerURL: required('MIDNIGHT_INDEXER_URL', env.MIDNIGHT_INDEXER_URL ?? defaults.indexerURL),
    indexerWsURL: required(
      'MIDNIGHT_INDEXER_WS_URL',
      env.MIDNIGHT_INDEXER_WS_URL ?? defaults.indexerWsURL,
    ),
    nodeURL: required('MIDNIGHT_NODE_URL', env.MIDNIGHT_NODE_URL ?? defaults.nodeURL),
    proofServerURL:
      env.MIDNIGHT_PROOF_SERVER_URL ?? MIDNIGHT_NETWORK_DEFAULTS[networkId].proofServerURL,
  }
}
