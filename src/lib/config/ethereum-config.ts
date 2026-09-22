import { z } from 'zod'

export interface EthereumConfig {
  readonly chainId: number
  readonly rpcURL: string
}

/** Public RPC endpoints of the chains with a known default. 31337 is the local development chain. */
export const ETHEREUM_RPC_DEFAULTS: Readonly<Record<number, string>> = {
  1: 'https://ethereum-rpc.publicnode.com',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  31337: 'http://127.0.0.1:8545',
}

/** The chain selects the default RPC; EVM_RPC_URL overrides it and is required for other chains. */
export const ethereumEnvSchema = z.object({
  EVM_CHAIN_ID: z
    .string()
    .regex(/^[1-9][0-9]*$/, 'expected a positive integer')
    .transform(Number)
    .pipe(z.number().int().positive().safe()),
  EVM_RPC_URL: z.url({ protocol: /^https?$/ }).optional(),
})

export type EthereumEnv = z.infer<typeof ethereumEnvSchema>

export function ethereumConfigFromEnv(env: EthereumEnv): EthereumConfig {
  const rpcURL = env.EVM_RPC_URL ?? ETHEREUM_RPC_DEFAULTS[env.EVM_CHAIN_ID]
  if (rpcURL === undefined) {
    throw new Error(
      `EVM_RPC_URL is required: chain ${env.EVM_CHAIN_ID} has no default RPC endpoint`,
    )
  }
  return { chainId: env.EVM_CHAIN_ID, rpcURL }
}
