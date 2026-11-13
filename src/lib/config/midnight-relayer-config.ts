import { z } from 'zod'

/** The backend's own Midnight wallet, which pays for every permissionless vault transaction. */
export interface MidnightRelayerConfig {
  /** The 32-byte HD wallet seed in hex, without a `0x` prefix. */
  readonly seed: string
}

export const midnightRelayerEnvSchema = z.object({
  MIDNIGHT_RELAYER_SEED: z
    .string()
    .regex(/^(?:0x)?[0-9a-fA-F]{64}$/, 'expected a 32-byte seed in hex')
    .transform((value) => value.replace(/^0x/i, '').toLowerCase()),
})

export type MidnightRelayerEnv = z.infer<typeof midnightRelayerEnvSchema>

export function midnightRelayerConfigFromEnv(env: MidnightRelayerEnv): MidnightRelayerConfig {
  return { seed: env.MIDNIGHT_RELAYER_SEED }
}
