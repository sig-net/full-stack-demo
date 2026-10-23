import { resolve } from 'node:path'

import { z } from 'zod'

/** Where the backend's proof provider finds every contract's prover keys and ZKIR. */
export interface MidnightProverConfig {
  /** One subdirectory per contract, each holding `keys/` and `zkir/`, as `yarn zk-assets` lays out. */
  readonly zkAssetsRoot: string
}

export const midnightProverEnvSchema = z.object({
  MIDNIGHT_ZK_ASSETS_ROOT: z.string().min(1).optional(),
})

export type MidnightProverEnv = z.infer<typeof midnightProverEnvSchema>

export function midnightProverConfigFromEnv(env: MidnightProverEnv): MidnightProverConfig {
  return { zkAssetsRoot: resolve(env.MIDNIGHT_ZK_ASSETS_ROOT ?? 'zk-assets') }
}
