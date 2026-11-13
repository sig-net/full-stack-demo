import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import {
  MIDNIGHT_NETWORK_DEFAULTS,
  type MidnightNetworkConfig,
  midnightNetworkConfigFromEnv,
  midnightNetworkEnvSchema,
} from '@/lib/config/midnight-network-config'

const PREPROD_ENDPOINTS = {
  MIDNIGHT_INDEXER_URL: 'https://indexer.example/api/v4/graphql',
  MIDNIGHT_INDEXER_WS_URL: 'wss://indexer.example/api/v4/graphql/ws',
  MIDNIGHT_NODE_URL: 'https://node.example',
}

const accepted: { name: string; env: Record<string, string>; expected: MidnightNetworkConfig }[] = [
  {
    name: 'undeployed defaults to the local stack',
    env: { MIDNIGHT_NETWORK_ID: MidnightNetwork.Undeployed },
    expected: MIDNIGHT_NETWORK_DEFAULTS[MidnightNetwork.Undeployed],
  },
  {
    name: 'preprod takes its node and indexer from their variables',
    env: { MIDNIGHT_NETWORK_ID: MidnightNetwork.Preprod, ...PREPROD_ENDPOINTS },
    expected: {
      networkId: MidnightNetwork.Preprod,
      indexerURL: PREPROD_ENDPOINTS.MIDNIGHT_INDEXER_URL,
      indexerWsURL: PREPROD_ENDPOINTS.MIDNIGHT_INDEXER_WS_URL,
      nodeURL: PREPROD_ENDPOINTS.MIDNIGHT_NODE_URL,
      proofServerURL: 'http://127.0.0.1:6300',
    },
  },
]

const refused: { name: string; env: Record<string, string>; message: string }[] = [
  {
    name: 'preprod refuses a missing indexer URL',
    env: {
      MIDNIGHT_NETWORK_ID: MidnightNetwork.Preprod,
      MIDNIGHT_INDEXER_WS_URL: PREPROD_ENDPOINTS.MIDNIGHT_INDEXER_WS_URL,
      MIDNIGHT_NODE_URL: PREPROD_ENDPOINTS.MIDNIGHT_NODE_URL,
    },
    message: 'MIDNIGHT_INDEXER_URL is required',
  },
  {
    name: 'preprod refuses a missing indexer WebSocket URL',
    env: {
      MIDNIGHT_NETWORK_ID: MidnightNetwork.Preprod,
      MIDNIGHT_INDEXER_URL: PREPROD_ENDPOINTS.MIDNIGHT_INDEXER_URL,
      MIDNIGHT_NODE_URL: PREPROD_ENDPOINTS.MIDNIGHT_NODE_URL,
    },
    message: 'MIDNIGHT_INDEXER_WS_URL is required',
  },
  {
    name: 'preprod refuses a missing node URL',
    env: {
      MIDNIGHT_NETWORK_ID: MidnightNetwork.Preprod,
      MIDNIGHT_INDEXER_URL: PREPROD_ENDPOINTS.MIDNIGHT_INDEXER_URL,
      MIDNIGHT_INDEXER_WS_URL: PREPROD_ENDPOINTS.MIDNIGHT_INDEXER_WS_URL,
    },
    message: 'MIDNIGHT_NODE_URL is required',
  },
]

describe('midnightNetworkConfigFromEnv', () => {
  test.each(accepted)('$name', ({ env, expected }) => {
    expect(midnightNetworkConfigFromEnv(midnightNetworkEnvSchema.parse(env))).toEqual(expected)
  })

  test.each(refused)('$name', ({ env, message }) => {
    expect(() => midnightNetworkConfigFromEnv(midnightNetworkEnvSchema.parse(env))).toThrow(message)
  })
})
