import { MidnightNetwork } from '@sig-net/midnight'
import { getVaultContractAddress } from '@sig-net/midnight-examples-erc20-vault-contract'
import { z } from 'zod'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { midnightContractAddressSchema } from '@/lib/config/midnight-value-schemas'

export interface MidnightVaultConfig {
  readonly contractAddress: string
}

/**
 * A deployed network publishes the vault address through the contract package; the variable
 * overrides it. The local stack deploys its own vault, so the variable is required there.
 */
export const midnightVaultEnvSchema = z.object({
  MIDNIGHT_VAULT_CONTRACT_ADDRESS: midnightContractAddressSchema.optional(),
})

export type MidnightVaultEnv = z.infer<typeof midnightVaultEnvSchema>

export function midnightVaultConfigFromEnv(
  networkId: MidnightNetworkId,
  env: MidnightVaultEnv,
): MidnightVaultConfig {
  const contractAddress =
    env.MIDNIGHT_VAULT_CONTRACT_ADDRESS ??
    (networkId === MidnightNetwork.Undeployed ? undefined : getVaultContractAddress(networkId))
  if (contractAddress === undefined) {
    throw new Error(
      `MIDNIGHT_VAULT_CONTRACT_ADDRESS is required: the ${networkId} network has no published vault contract address`,
    )
  }
  return { contractAddress }
}
