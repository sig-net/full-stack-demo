import { MidnightNetwork } from '@sig-net/midnight'
import { getVaultContractAddress } from '@sig-net/midnight-examples-erc20-vault-contract'
import { z } from 'zod'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { midnightContractAddressSchema } from '@/lib/config/midnight-value-schemas'

export interface MidnightEthereumErc20VaultConfig {
  readonly contractAddress: string
}

/**
 * A deployed network publishes the vault address through the contract package, and the variable
 * overrides it. The local stack deploys its own vault, so the variable is required there.
 */
export const midnightEthereumErc20VaultEnvSchema = z.object({
  MIDNIGHT_ETHEREUM_ERC20_VAULT_CONTRACT_ADDRESS: midnightContractAddressSchema.optional(),
})

export type MidnightEthereumErc20VaultEnv = z.infer<typeof midnightEthereumErc20VaultEnvSchema>

export function midnightEthereumErc20VaultConfigFromEnv(
  networkId: MidnightNetworkId,
  env: MidnightEthereumErc20VaultEnv,
): MidnightEthereumErc20VaultConfig {
  const contractAddress =
    env.MIDNIGHT_ETHEREUM_ERC20_VAULT_CONTRACT_ADDRESS ??
    (networkId === MidnightNetwork.Undeployed ? undefined : getVaultContractAddress(networkId))
  if (contractAddress === undefined) {
    throw new Error(
      `MIDNIGHT_ETHEREUM_ERC20_VAULT_CONTRACT_ADDRESS is required: the ${networkId} network has no published vault contract address`,
    )
  }
  return { contractAddress }
}
