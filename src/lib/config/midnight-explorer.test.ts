import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import type { ClientConfig } from '@/lib/config/client-config'
import { midnightExplorerOf } from '@/lib/config/midnight-explorer'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'

function configOf(
  networkId: MidnightNetworkId,
  nodeURL: string,
  rpcURL: string,
): Pick<ClientConfig, 'midnightNetwork' | 'ethereum'> {
  return {
    midnightNetwork: { networkId, indexerURL: '', indexerWsURL: '', nodeURL, proofServerURL: '' },
    ethereum: { chainId: 11155111, rpcURL, uniswapQuoterAddress: `0x${'00'.repeat(20)}` },
  }
}

describe('midnightExplorerOf', () => {
  const cases: ReadonlyArray<{
    name: string
    config: Pick<ClientConfig, 'midnightNetwork' | 'ethereum'>
    expected: string
  }> = [
    {
      name: 'the local stack links to its own Polkadot.js Apps over the local node',
      config: configOf(
        MidnightNetwork.Undeployed,
        'http://127.0.0.1:9944',
        'http://127.0.0.1:8545',
      ),
      expected: 'http://localhost:5300/?rpc=ws%3A%2F%2F127.0.0.1%3A9944#/explorer/query/8562',
    },
    {
      name: 'a public network links to the public Polkadot.js Apps over its node',
      config: configOf(
        MidnightNetwork.Stagenet,
        'https://rpc.stagenet.shielded.tools',
        'https://rpc.example',
      ),
      expected:
        'https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Frpc.stagenet.shielded.tools#/explorer/query/8562',
    },
  ]

  test.each(cases)('$name', ({ config, expected }) => {
    const explorer = midnightExplorerOf(config)
    expect(explorer.name).toBe('Polkadot.js Apps')
    expect(explorer.blockURL(8562)).toBe(expected)
  })
})
