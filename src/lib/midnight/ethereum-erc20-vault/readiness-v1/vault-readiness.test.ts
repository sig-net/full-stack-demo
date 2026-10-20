import { describe, expect, test } from 'vitest'

import {
  missingReadiness,
  type ReadinessAction,
  type ReadinessCheck,
  type ReadinessCheckId,
  readReadinessCheck,
  type VaultReadiness,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'

const OK: ReadinessCheck = {
  status: 'ok',
  asset: 'ETH',
  account: '0x1',
  available: 2n,
  required: 1n,
}
const SHORT: ReadinessCheck = {
  status: 'insufficient',
  asset: 'DUST',
  account: 'mn1',
  available: 0n,
  required: 1n,
}
const UNREAD: ReadinessCheck = { status: 'unavailable', asset: 'DUST', account: 'mn1', reason: 'x' }

function checks(overrides: Partial<VaultReadiness> = {}): VaultReadiness {
  return {
    relayerDust: OK,
    depositAccountEth: OK,
    vaultAccountEth: OK,
    ...overrides,
  }
}

describe('missingReadiness', () => {
  const cases: {
    name: string
    action: ReadinessAction
    checks: VaultReadiness
    expected: ReadinessCheckId[]
  }[] = [
    {
      name: 'everything ok leaves a deposit ready',
      action: 'deposit',
      checks: checks(),
      expected: [],
    },
    {
      name: 'a deposit needs the relayer and the deposit account, in that order',
      action: 'deposit',
      checks: checks({ relayerDust: UNREAD, depositAccountEth: SHORT }),
      expected: ['relayerDust', 'depositAccountEth'],
    },
    {
      name: 'a deposit ignores the vault account',
      action: 'deposit',
      checks: checks({ vaultAccountEth: SHORT }),
      expected: [],
    },
    {
      name: 'an unavailable read counts as not ready',
      action: 'deposit',
      checks: checks({ depositAccountEth: UNREAD }),
      expected: ['depositAccountEth'],
    },
    {
      name: 'a withdraw needs the vault account and ignores the deposit account',
      action: 'withdraw',
      checks: checks({ depositAccountEth: SHORT, vaultAccountEth: SHORT }),
      expected: ['vaultAccountEth'],
    },
    {
      name: 'a supply needs the relayer and the vault account and ignores the deposit account',
      action: 'supply',
      checks: checks({ relayerDust: SHORT, depositAccountEth: SHORT, vaultAccountEth: UNREAD }),
      expected: ['relayerDust', 'vaultAccountEth'],
    },
    {
      name: 'a redeem needs the vault account and ignores the deposit account',
      action: 'redeem',
      checks: checks({ depositAccountEth: SHORT, vaultAccountEth: SHORT }),
      expected: ['vaultAccountEth'],
    },
    {
      name: 'a swap needs the relayer and the vault account and ignores the deposit account',
      action: 'swap',
      checks: checks({ relayerDust: SHORT, depositAccountEth: SHORT, vaultAccountEth: UNREAD }),
      expected: ['relayerDust', 'vaultAccountEth'],
    },
    {
      name: 'an approval needs the relayer and the vault account and ignores the deposit account',
      action: 'approve',
      checks: checks({ relayerDust: SHORT, depositAccountEth: SHORT, vaultAccountEth: UNREAD }),
      expected: ['relayerDust', 'vaultAccountEth'],
    },
  ]

  test.each(cases)('$name', ({ action, checks: state, expected }) => {
    expect(missingReadiness(action, state)).toEqual(expected)
  })
})

describe('readReadinessCheck', () => {
  test.each([
    {
      name: 'a balance at the requirement is ok',
      read: () => Promise.resolve({ available: 5n, required: 5n }),
      expected: { status: 'ok', asset: 'ETH', account: '0x1', available: 5n, required: 5n },
    },
    {
      name: 'a balance below the requirement is insufficient',
      read: () => Promise.resolve({ available: 4n, required: 5n }),
      expected: {
        status: 'insufficient',
        asset: 'ETH',
        account: '0x1',
        available: 4n,
        required: 5n,
      },
    },
    {
      name: 'a failed read is unavailable with the deepest message, never zero',
      read: () => Promise.reject(new Error('rpc down', { cause: new Error('ECONNREFUSED') })),
      expected: {
        status: 'unavailable',
        asset: 'ETH',
        account: '0x1',
        reason: 'rpc down: ECONNREFUSED',
      },
    },
  ])('$name', async ({ read, expected }) => {
    await expect(readReadinessCheck('ETH', '0x1', read)).resolves.toEqual(expected)
  })
})
