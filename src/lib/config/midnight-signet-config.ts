import {
  MidnightNetwork,
  getMpcRootPublicKey,
  getResponderContractAddress,
  getSignerContractAddress,
} from '@sig-net/midnight'
import { z } from 'zod'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import {
  midnightContractAddressSchema,
  secp256k1PublicKeySchema,
} from '@/lib/config/midnight-value-schemas'

export interface MidnightSignetConfig {
  /** The signet signer the vault notifies of its requests. */
  readonly signerContractAddress: string
  /** The signet responder the MPC posts its responses to. */
  readonly responderContractAddress: string
  readonly mpcRootPublicKey: string
}

/**
 * A deployed network publishes every value through the SDK, and each variable overrides one of
 * them. The local stack deploys its own signer and responder and generates its own key, so every
 * variable is required there.
 */
export const midnightSignetEnvSchema = z.object({
  MIDNIGHT_SIGNER_CONTRACT_ADDRESS: midnightContractAddressSchema.optional(),
  MIDNIGHT_RESPONDER_CONTRACT_ADDRESS: midnightContractAddressSchema.optional(),
  MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY: secp256k1PublicKeySchema.optional(),
})

export type MidnightSignetEnv = z.infer<typeof midnightSignetEnvSchema>

export function midnightSignetConfigFromEnv(
  networkId: MidnightNetworkId,
  env: MidnightSignetEnv,
): MidnightSignetConfig {
  const published: MidnightSignetConfig | undefined =
    networkId === MidnightNetwork.Undeployed
      ? undefined
      : {
          signerContractAddress: getSignerContractAddress(networkId),
          responderContractAddress: getResponderContractAddress(networkId),
          mpcRootPublicKey: getMpcRootPublicKey(networkId),
        }
  const signerContractAddress =
    env.MIDNIGHT_SIGNER_CONTRACT_ADDRESS ?? published?.signerContractAddress
  if (signerContractAddress === undefined) {
    throw new Error(
      `MIDNIGHT_SIGNER_CONTRACT_ADDRESS is required: the ${networkId} network has no published signet signer address`,
    )
  }
  const responderContractAddress =
    env.MIDNIGHT_RESPONDER_CONTRACT_ADDRESS ?? published?.responderContractAddress
  if (responderContractAddress === undefined) {
    throw new Error(
      `MIDNIGHT_RESPONDER_CONTRACT_ADDRESS is required: the ${networkId} network has no published signet responder address`,
    )
  }
  const mpcRootPublicKey = env.MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY ?? published?.mpcRootPublicKey
  if (mpcRootPublicKey === undefined) {
    throw new Error(
      `MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY is required: the ${networkId} network has no published MPC root public key`,
    )
  }
  return { signerContractAddress, responderContractAddress, mpcRootPublicKey }
}
