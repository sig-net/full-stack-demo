import { z } from 'zod'

export interface EthereumConfig {
  readonly chainId: number
  readonly rpcURL: string
  /** Uniswap's QuoterV2 on the chain, the read-only price source of a swap quote. */
  readonly uniswapQuoterAddress: string
}

/** The local development chain, a Sepolia fork. */
export const LOCAL_CHAIN_ID = 31337

/** Public RPC endpoints of the chains with a known default. */
export const ETHEREUM_RPC_DEFAULTS: Readonly<Record<number, string>> = {
  1: 'https://ethereum-rpc.publicnode.com',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  [LOCAL_CHAIN_ID]: 'http://127.0.0.1:8545',
}

/** Uniswap V3 QuoterV2 on the chains with a known deployment; the local chain forks Sepolia. */
export const UNISWAP_QUOTER_DEFAULTS: Readonly<Record<number, string>> = {
  11155111: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
  [LOCAL_CHAIN_ID]: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
}

/** The chain selects the default RPC and quoter. EVM_RPC_URL overrides it and is required for other chains. */
export const ethereumEnvSchema = z.object({
  EVM_CHAIN_ID: z
    .string()
    .regex(/^[1-9][0-9]*$/, 'expected a positive integer')
    .transform(Number)
    .pipe(z.number().int().positive().safe()),
  EVM_RPC_URL: z.url({ protocol: /^https?$/ }).optional(),
  EVM_UNISWAP_QUOTER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte address in hex')
    .optional(),
})

export type EthereumEnv = z.infer<typeof ethereumEnvSchema>

export function ethereumConfigFromEnv(env: EthereumEnv): EthereumConfig {
  const rpcURL = env.EVM_RPC_URL ?? ETHEREUM_RPC_DEFAULTS[env.EVM_CHAIN_ID]
  if (rpcURL === undefined) {
    throw new Error(
      `EVM_RPC_URL is required: chain ${env.EVM_CHAIN_ID} has no default RPC endpoint`,
    )
  }
  const uniswapQuoterAddress =
    env.EVM_UNISWAP_QUOTER_ADDRESS ?? UNISWAP_QUOTER_DEFAULTS[env.EVM_CHAIN_ID]
  if (uniswapQuoterAddress === undefined) {
    throw new Error(
      `EVM_UNISWAP_QUOTER_ADDRESS is required: chain ${env.EVM_CHAIN_ID} has no known Uniswap quoter`,
    )
  }
  return { chainId: env.EVM_CHAIN_ID, rpcURL, uniswapQuoterAddress }
}
