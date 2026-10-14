import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import { isLocalEnvironment } from '@/lib/config/local-environment'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'

const cases: { name: string; networkId: MidnightNetworkId; rpcURL: string; expected: boolean }[] = [
  {
    name: 'undeployed with a loopback RPC is local',
    networkId: MidnightNetwork.Undeployed,
    rpcURL: 'http://127.0.0.1:8545',
    expected: true,
  },
  {
    name: 'localhost counts as loopback',
    networkId: MidnightNetwork.Undeployed,
    rpcURL: 'http://localhost:8545',
    expected: true,
  },
  {
    name: 'a deployed network is never local',
    networkId: MidnightNetwork.Stagenet,
    rpcURL: 'http://127.0.0.1:8545',
    expected: false,
  },
  {
    name: 'a remote RPC is never local',
    networkId: MidnightNetwork.Undeployed,
    rpcURL: 'https://sepolia.example.org',
    expected: false,
  },
  {
    name: 'an unparsable RPC is never local',
    networkId: MidnightNetwork.Undeployed,
    rpcURL: 'not a url',
    expected: false,
  },
]

describe('isLocalEnvironment', () => {
  test.each(cases)('$name', ({ networkId, rpcURL, expected }) => {
    expect(
      isLocalEnvironment({
        midnightNetwork: {
          networkId,
          indexerURL: '',
          indexerWsURL: '',
          nodeURL: '',
          proofServerURL: '',
        },
        ethereum: { chainId: 11155111, rpcURL, uniswapQuoterAddress: `0x${'00'.repeat(20)}` },
      }),
    ).toBe(expected)
  })
})
