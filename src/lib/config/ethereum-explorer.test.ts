import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import type { ClientConfig } from '@/lib/config/client-config'
import { ethereumExplorerOf } from '@/lib/config/ethereum-explorer'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'

const HASH = `0x${'ab'.repeat(32)}`

function configOf(
  networkId: MidnightNetworkId,
  chainId: number,
  rpcURL: string,
): Pick<ClientConfig, 'midnightNetwork' | 'ethereum'> {
  return {
    midnightNetwork: {
      networkId,
      indexerURL: '',
      indexerWsURL: '',
      nodeURL: '',
      proofServerURL: '',
    },
    ethereum: { chainId, rpcURL, uniswapQuoterAddress: `0x${'00'.repeat(20)}` },
  }
}

describe('ethereumExplorerOf', () => {
  const cases: ReadonlyArray<{
    name: string
    config: Pick<ClientConfig, 'midnightNetwork' | 'ethereum'>
    expected: { name: string; url: string } | null
  }> = [
    {
      name: 'the local stack links to Otterscan although its fork reports Sepolia',
      config: configOf(MidnightNetwork.Undeployed, 11155111, 'http://127.0.0.1:8545'),
      expected: { name: 'Otterscan', url: `http://localhost:5100/tx/${HASH}` },
    },
    {
      name: 'Sepolia links to its Etherscan',
      config: configOf(MidnightNetwork.Stagenet, 11155111, 'https://rpc.example'),
      expected: { name: 'Etherscan', url: `https://sepolia.etherscan.io/tx/${HASH}` },
    },
    {
      name: 'mainnet links to Etherscan',
      config: configOf(MidnightNetwork.Stagenet, 1, 'https://rpc.example'),
      expected: { name: 'Etherscan', url: `https://etherscan.io/tx/${HASH}` },
    },
    {
      name: 'an undeployed network over a remote node is not the local stack',
      config: configOf(MidnightNetwork.Undeployed, 11155111, 'https://rpc.example'),
      expected: { name: 'Etherscan', url: `https://sepolia.etherscan.io/tx/${HASH}` },
    },
    {
      name: 'a chain without a known explorer has none',
      config: configOf(MidnightNetwork.Stagenet, 4242, 'https://rpc.example'),
      expected: null,
    },
  ]

  test.each(cases)('$name', ({ config, expected }) => {
    const explorer = ethereumExplorerOf(config)
    expect(
      explorer === null ? null : { name: explorer.name, url: explorer.transactionURL(HASH) },
    ).toEqual(expected)
  })
})
