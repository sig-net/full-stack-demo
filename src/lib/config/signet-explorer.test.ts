import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import type { ClientConfig } from '@/lib/config/client-config'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { signetExplorerOf } from '@/lib/config/signet-explorer'

const REQUEST_ID = 'e3'.repeat(32)

function configOf(
  networkId: MidnightNetworkId,
  rpcURL: string,
): Pick<ClientConfig, 'midnightNetwork' | 'ethereum'> {
  return {
    midnightNetwork: {
      networkId,
      indexerURL: '',
      indexerWsURL: '',
      nodeURL: 'http://127.0.0.1:9944',
      proofServerURL: '',
    },
    ethereum: { chainId: 11155111, rpcURL, uniswapQuoterAddress: `0x${'00'.repeat(20)}` },
  }
}

describe('signetExplorerOf', () => {
  const cases: ReadonlyArray<{
    name: string
    config: Pick<ClientConfig, 'midnightNetwork' | 'ethereum'>
    expected: string
  }> = [
    {
      name: 'the local stack links to its own explorer on the undeployed network',
      config: configOf(MidnightNetwork.Undeployed, 'http://127.0.0.1:8545'),
      expected: `http://localhost:5400/midnight/explorer?networkId=undeployed&requestId=${REQUEST_ID}`,
    },
    {
      name: 'a public network links to the published explorer on that network',
      config: configOf(MidnightNetwork.Stagenet, 'https://rpc.example'),
      expected: `https://sig-net.github.io/explorer/midnight/explorer?networkId=stagenet&requestId=${REQUEST_ID}`,
    },
  ]

  test.each(cases)('$name', ({ config, expected }) => {
    expect(signetExplorerOf(config).requestURL(REQUEST_ID)).toBe(expected)
  })
})
