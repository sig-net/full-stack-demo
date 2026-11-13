import {
  MidnightNetwork,
  getMpcRootPublicKey,
  getResponderContractAddress,
  getSignerContractAddress,
} from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import {
  type MidnightSignetConfig,
  midnightSignetConfigFromEnv,
  midnightSignetEnvSchema,
} from '@/lib/config/midnight-signet-config'

const SIGNER = '11'.repeat(32)
const RESPONDER = '22'.repeat(32)
const MPC_ROOT_PUBLIC_KEY = getMpcRootPublicKey(MidnightNetwork.Preprod)

const accepted: {
  name: string
  networkId: MidnightNetworkId
  env: Record<string, string>
  expected: MidnightSignetConfig
}[] = [
  {
    name: 'preprod defaults to the values the SDK publishes',
    networkId: MidnightNetwork.Preprod,
    env: {},
    expected: {
      signerContractAddress: getSignerContractAddress(MidnightNetwork.Preprod),
      responderContractAddress: getResponderContractAddress(MidnightNetwork.Preprod),
      mpcRootPublicKey: MPC_ROOT_PUBLIC_KEY,
    },
  },
  {
    name: 'each variable overrides its published value on preprod',
    networkId: MidnightNetwork.Preprod,
    env: {
      MIDNIGHT_SIGNER_CONTRACT_ADDRESS: SIGNER,
      MIDNIGHT_RESPONDER_CONTRACT_ADDRESS: RESPONDER,
    },
    expected: {
      signerContractAddress: SIGNER,
      responderContractAddress: RESPONDER,
      mpcRootPublicKey: MPC_ROOT_PUBLIC_KEY,
    },
  },
  {
    name: 'undeployed takes every value from its variable',
    networkId: MidnightNetwork.Undeployed,
    env: {
      MIDNIGHT_SIGNER_CONTRACT_ADDRESS: SIGNER,
      MIDNIGHT_RESPONDER_CONTRACT_ADDRESS: RESPONDER,
      MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY: MPC_ROOT_PUBLIC_KEY,
    },
    expected: {
      signerContractAddress: SIGNER,
      responderContractAddress: RESPONDER,
      mpcRootPublicKey: MPC_ROOT_PUBLIC_KEY,
    },
  },
]

const refused: { name: string; env: Record<string, string>; message: string }[] = [
  {
    name: 'undeployed refuses a missing signer address',
    env: {
      MIDNIGHT_RESPONDER_CONTRACT_ADDRESS: RESPONDER,
      MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY: MPC_ROOT_PUBLIC_KEY,
    },
    message: 'MIDNIGHT_SIGNER_CONTRACT_ADDRESS is required',
  },
  {
    name: 'undeployed refuses a missing responder address',
    env: {
      MIDNIGHT_SIGNER_CONTRACT_ADDRESS: SIGNER,
      MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY: MPC_ROOT_PUBLIC_KEY,
    },
    message: 'MIDNIGHT_RESPONDER_CONTRACT_ADDRESS is required',
  },
  {
    name: 'undeployed refuses a missing MPC root public key',
    env: {
      MIDNIGHT_SIGNER_CONTRACT_ADDRESS: SIGNER,
      MIDNIGHT_RESPONDER_CONTRACT_ADDRESS: RESPONDER,
    },
    message: 'MIDNIGHT_SIGNET_MPC_ROOT_PUBLIC_KEY is required',
  },
]

describe('midnightSignetConfigFromEnv', () => {
  test.each(accepted)('$name', ({ networkId, env, expected }) => {
    expect(midnightSignetConfigFromEnv(networkId, midnightSignetEnvSchema.parse(env))).toEqual(
      expected,
    )
  })

  test.each(refused)('$name', ({ env, message }) => {
    expect(() =>
      midnightSignetConfigFromEnv(MidnightNetwork.Undeployed, midnightSignetEnvSchema.parse(env)),
    ).toThrow(message)
  })
})
