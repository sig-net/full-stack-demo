import { MidnightNetwork, getMpcRootPublicKey, getSignetContractAddress } from '@sig-net/midnight'
import { z } from 'zod'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import {
  midnightContractAddressSchema,
  secp256k1PublicKeySchema,
} from '@/lib/config/midnight-value-schemas'

export interface MidnightSignetConfig {
  readonly contractAddress: string
  readonly mpcRootPublicKey: string
}

/**
 * A deployed network publishes both values through the SDK; each variable overrides one of them.
 * The local stack deploys its own singleton and generates its own key, so both are required there.
 */
export const midnightSignetEnvSchema = z.object({
  MIDNIGHT_SIGNET_CONTRACT_ADDRESS: midnightContractAddressSchema.optional(),
  MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY: secp256k1PublicKeySchema.optional(),
})

export type MidnightSignetEnv = z.infer<typeof midnightSignetEnvSchema>

export function midnightSignetConfigFromEnv(
  networkId: MidnightNetworkId,
  env: MidnightSignetEnv,
): MidnightSignetConfig {
  const published =
    networkId === MidnightNetwork.Undeployed
      ? undefined
      : {
          contractAddress: getSignetContractAddress(networkId),
          mpcRootPublicKey: getMpcRootPublicKey(networkId),
        }
  const contractAddress = env.MIDNIGHT_SIGNET_CONTRACT_ADDRESS ?? published?.contractAddress
  if (contractAddress === undefined) {
    throw new Error(
      `MIDNIGHT_SIGNET_CONTRACT_ADDRESS is required: the ${networkId} network has no published signet contract address`,
    )
  }
  const mpcRootPublicKey = env.MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY ?? published?.mpcRootPublicKey
  if (mpcRootPublicKey === undefined) {
    throw new Error(
      `MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY is required: the ${networkId} network has no published MPC root public key`,
    )
  }
  return { contractAddress, mpcRootPublicKey }
}
