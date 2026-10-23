import { MidnightNetwork, getMpcOutputCacheUrl } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import {
  type MidnightRespondOutputConfig,
  midnightRespondOutputConfigFromEnv,
  midnightRespondOutputEnvSchema,
} from '@/lib/config/midnight-respond-output-config'

const accepted: {
  name: string
  networkId: MidnightNetworkId
  env: Record<string, string>
  expected: MidnightRespondOutputConfig
}[] = [
  {
    name: 'stagenet defaults to the cache the SDK publishes',
    networkId: MidnightNetwork.Stagenet,
    env: {},
    expected: {
      source: 'mpc-cache',
      mpcOutputCacheURL: getMpcOutputCacheUrl(MidnightNetwork.Stagenet),
    },
  },
  {
    name: 'undeployed defaults to the local fakenet cache',
    networkId: MidnightNetwork.Undeployed,
    env: {},
    expected: { source: 'mpc-cache', mpcOutputCacheURL: 'http://127.0.0.1:3040/v1/fakenet' },
  },
  {
    name: 'MPC_OUTPUT_CACHE_URL overrides the network default',
    networkId: MidnightNetwork.Stagenet,
    env: { MPC_OUTPUT_CACHE_URL: 'https://cache.example/v1/stagenet' },
    expected: { source: 'mpc-cache', mpcOutputCacheURL: 'https://cache.example/v1/stagenet' },
  },
  {
    name: 'evm-node can be chosen',
    networkId: MidnightNetwork.Stagenet,
    env: { RESPOND_OUTPUT_SOURCE: 'evm-node' },
    expected: { source: 'evm-node' },
  },
]

describe('midnightRespondOutputConfigFromEnv', () => {
  test.each(accepted)('$name', ({ networkId, env, expected }) => {
    expect(
      midnightRespondOutputConfigFromEnv(networkId, midnightRespondOutputEnvSchema.parse(env)),
    ).toEqual(expected)
  })
})
