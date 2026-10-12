import { describe, expect, test } from 'vitest'

import {
  MIDNIGHT_SHIELDED_NETWORK_NAME,
  MIDNIGHT_UNSHIELDED_NETWORK_NAME,
  type MidnightBalanceAmount,
  readMidnightBalanceAmounts,
} from '@/lib/balances/midnight-balances'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const NIGHT = '0'.repeat(64)
const TOKEN_A = `a1b2${'0'.repeat(60)}`
const TOKEN_B = `ffff${'1'.repeat(60)}`
const SHIELDED_NIGHT_LIKE = `0000${'f'.repeat(60)}`

interface Case {
  readonly name: string
  readonly shielded: Record<string, bigint>
  readonly unshielded: Record<string, bigint>
  readonly expected: MidnightBalanceAmount[]
}

const cases: Case[] = [
  {
    name: 'no balances on either ledger gives an empty list',
    shielded: {},
    unshielded: {},
    expected: [],
  },
  {
    name: 'the token code is the first four hex characters and the amount is written in full',
    shielded: {},
    unshielded: { [NIGHT]: 1234567890123456789n },
    expected: [
      {
        tokenType: NIGHT,
        assetSymbol: '0000',
        networkName: MIDNIGHT_UNSHIELDED_NETWORK_NAME,
        amount: '1234567890123456789',
        usdValue: '0.00',
      },
    ],
  },
  {
    name: 'shielded balances come first and each ledger is ordered by token type',
    shielded: { [TOKEN_B]: 5n, [TOKEN_A]: 7n },
    unshielded: { [NIGHT]: 0n },
    expected: [
      {
        tokenType: TOKEN_A,
        assetSymbol: 'a1b2',
        networkName: MIDNIGHT_SHIELDED_NETWORK_NAME,
        amount: '7',
        usdValue: '0.00',
      },
      {
        tokenType: TOKEN_B,
        assetSymbol: 'ffff',
        networkName: MIDNIGHT_SHIELDED_NETWORK_NAME,
        amount: '5',
        usdValue: '0.00',
      },
      {
        tokenType: NIGHT,
        assetSymbol: '0000',
        networkName: MIDNIGHT_UNSHIELDED_NETWORK_NAME,
        amount: '0',
        usdValue: '0.00',
      },
    ],
  },
  {
    name: 'token types sharing a symbol stay distinct by token type, on one ledger or across both',
    shielded: { [SHIELDED_NIGHT_LIKE]: 3n, [NIGHT]: 2n },
    unshielded: { [NIGHT]: 4n },
    expected: [
      {
        tokenType: NIGHT,
        assetSymbol: '0000',
        networkName: MIDNIGHT_SHIELDED_NETWORK_NAME,
        amount: '2',
        usdValue: '0.00',
      },
      {
        tokenType: SHIELDED_NIGHT_LIKE,
        assetSymbol: '0000',
        networkName: MIDNIGHT_SHIELDED_NETWORK_NAME,
        amount: '3',
        usdValue: '0.00',
      },
      {
        tokenType: NIGHT,
        assetSymbol: '0000',
        networkName: MIDNIGHT_UNSHIELDED_NETWORK_NAME,
        amount: '4',
        usdValue: '0.00',
      },
    ],
  },
]

describe('readMidnightBalanceAmounts', () => {
  test.each(cases)('$name', async ({ shielded, unshielded, expected }) => {
    const wallet = mock<Wallet>('wallet', {
      getShieldedBalances: () => Promise.resolve(shielded),
      getUnshieldedBalances: () => Promise.resolve(unshielded),
    })
    await expect(readMidnightBalanceAmounts(wallet)).resolves.toEqual(expected)
  })

  test('a failed read rejects instead of reporting zero', async () => {
    const wallet = mock<Wallet>('wallet', {
      getShieldedBalances: () => Promise.reject(new Error('Wallet is still synchronising.')),
      getUnshieldedBalances: () => Promise.resolve({}),
    })
    await expect(readMidnightBalanceAmounts(wallet)).rejects.toThrow(
      'Wallet is still synchronising.',
    )
  })
})
