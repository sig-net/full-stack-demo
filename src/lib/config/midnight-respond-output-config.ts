import { z } from 'zod'

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

export const midnightRespondOutputEnvSchema = z.object({
  RESPOND_OUTPUT_SOURCE: z.enum(RESPOND_OUTPUT_SOURCES).optional(),
  MPC_OUTPUT_CACHE_URL: z.url({ protocol: /^https?$/ }).optional(),
})

export type MidnightRespondOutputEnv = z.infer<typeof midnightRespondOutputEnvSchema>

export function midnightRespondOutputConfigFromEnv(
  env: MidnightRespondOutputEnv,
): MidnightRespondOutputConfig {
  const source = env.RESPOND_OUTPUT_SOURCE ?? 'evm-node'
  switch (source) {
    case 'evm-node':
      return { source }
    case 'mpc-cache':
      if (env.MPC_OUTPUT_CACHE_URL === undefined) {
        throw new Error('MPC_OUTPUT_CACHE_URL is required when RESPOND_OUTPUT_SOURCE is mpc-cache')
      }
      return { source, mpcOutputCacheURL: env.MPC_OUTPUT_CACHE_URL }
    default: {
      const unhandled: never = source
      throw new Error(`Unhandled source ${JSON.stringify(unhandled)}`)
    }
  }
}
