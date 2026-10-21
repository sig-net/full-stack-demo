import { MidnightNetwork, getMpcOutputCacheUrl } from '@sig-net/midnight'
import { z } from 'zod'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'

/**
 * Where the backend obtains the bytes an MPC attestation is verified over. The EVM node source
 * recomputes them from the mined transaction's trace, and the MPC cache source downloads the bytes
 * the MPC uploaded before it posted.
 */
export const RESPOND_OUTPUT_SOURCES = ['evm-node', 'mpc-cache'] as const

export type RespondOutputSource = (typeof RESPOND_OUTPUT_SOURCES)[number]

export type MidnightRespondOutputConfig =
  | { readonly source: 'evm-node' }
  | {
      readonly source: 'mpc-cache'
      /** The MPC output cache's base URL. */
      readonly mpcOutputCacheURL: string
    }

/** Each network's MPC output cache, which MPC_OUTPUT_CACHE_URL overrides. */
export const MPC_OUTPUT_CACHE_URL_DEFAULTS: Readonly<Record<MidnightNetworkId, string>> = {
  /** The local stack's fakenet responder serves its cache on this port and prefix. */
  [MidnightNetwork.Undeployed]: 'http://127.0.0.1:3040/v1/fakenet',
  [MidnightNetwork.Stagenet]: getMpcOutputCacheUrl(MidnightNetwork.Stagenet),
}

export const midnightRespondOutputEnvSchema = z.object({
  RESPOND_OUTPUT_SOURCE: z.enum(RESPOND_OUTPUT_SOURCES).optional(),
  MPC_OUTPUT_CACHE_URL: z.url({ protocol: /^https?$/ }).optional(),
})

export type MidnightRespondOutputEnv = z.infer<typeof midnightRespondOutputEnvSchema>

export function midnightRespondOutputConfigFromEnv(
  networkId: MidnightNetworkId,
  env: MidnightRespondOutputEnv,
): MidnightRespondOutputConfig {
  const source = env.RESPOND_OUTPUT_SOURCE ?? 'mpc-cache'
  switch (source) {
    case 'evm-node':
      return { source }
    case 'mpc-cache':
      return {
        source,
        mpcOutputCacheURL: env.MPC_OUTPUT_CACHE_URL ?? MPC_OUTPUT_CACHE_URL_DEFAULTS[networkId],
      }
    default: {
      const unhandled: never = source
      throw new Error(`Unhandled source ${JSON.stringify(unhandled)}`)
    }
  }
}
