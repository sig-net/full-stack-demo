import { describe, expect, test } from 'vitest'

import {
  MIDNIGHT_NETWORK_NAME,
  type MidnightBalanceAmount,
  readMidnightBalanceAmounts,
} from '@/lib/balances/midnight-balances'
import { NO_ICON } from '@/lib/icon-source'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'
import { BUNDLED_NETWORK_ICONS } from '@/lib/tokens/bundled-icons'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

const USDC_TYPE = `0000${'a'.repeat(60)}`
const UNKNOWN_TYPE = '0'.repeat(64)
const OTHER_UNKNOWN_TYPE = `0000${'f'.repeat(60)}`

const USDC: TokenInfo = {
  id: { ledger: 'shielded', tokenType: USDC_TYPE },
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  icon: { source: 'web3icons', name: 'USDC' },
  origin: {
    kind: 'ethereum-erc20-vault',
    chainId: 11155111,
    erc20Address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    issuer: 'Circle',
  },
  supported: true,
  pricing: null,
}

const registry = new TokenInfoRegistry([USDC])

interface Case {
  readonly name: string
  readonly shielded: Record<string, bigint>
  readonly expected: MidnightBalanceAmount[]
}

const cases: Case[] = [
  {
    name: 'no shielded balances gives an empty list',
    shielded: {},
    expected: [],
  },
  {
    name: 'a registered token shows its symbol, whole-token amount, icons and origin chain',
    shielded: { [USDC_TYPE]: 1_500_000n },
    expected: [
      {
        tokenType: USDC_TYPE,
        baseUnits: 1_500_000n,
        assetSymbol: 'USDC',
        networkName: 'Ethereum',
        amount: '1.5',
        usdValue: null,
        icon: { source: 'web3icons', name: 'USDC' },
        networkIcon: BUNDLED_NETWORK_ICONS.ethereum,
      },
    ],
  },
  {
    name: 'an unregistered token shows four hex characters, base units and no icons',
    shielded: { [UNKNOWN_TYPE]: 1234567890123456789n },
    expected: [
      {
        tokenType: UNKNOWN_TYPE,
        baseUnits: 1234567890123456789n,
        assetSymbol: '0000',
        networkName: MIDNIGHT_NETWORK_NAME,
        amount: '1234567890123456789',
        usdValue: null,
        icon: NO_ICON,
        networkIcon: NO_ICON,
      },
    ],
  },
  {
    name: 'balances are ordered by token type and stay distinct when symbols collide',
    shielded: { [OTHER_UNKNOWN_TYPE]: 3n, [USDC_TYPE]: 2_000_000n, [UNKNOWN_TYPE]: 4n },
    expected: [
      {
        tokenType: UNKNOWN_TYPE,
        baseUnits: 4n,
        assetSymbol: '0000',
        networkName: MIDNIGHT_NETWORK_NAME,
        amount: '4',
        usdValue: null,
        icon: NO_ICON,
        networkIcon: NO_ICON,
      },
      {
        tokenType: USDC_TYPE,
        baseUnits: 2_000_000n,
        assetSymbol: 'USDC',
        networkName: 'Ethereum',
        amount: '2',
        usdValue: null,
        icon: { source: 'web3icons', name: 'USDC' },
        networkIcon: BUNDLED_NETWORK_ICONS.ethereum,
      },
      {
        tokenType: OTHER_UNKNOWN_TYPE,
        baseUnits: 3n,
        assetSymbol: '0000',
        networkName: MIDNIGHT_NETWORK_NAME,
        amount: '3',
        usdValue: null,
        icon: NO_ICON,
        networkIcon: NO_ICON,
      },
    ],
  },
]

describe('readMidnightBalanceAmounts', () => {
  test.each(cases)('$name', async ({ shielded, expected }) => {
    const wallet = mock<Wallet>('wallet', {
      getShieldedBalances: () => Promise.resolve(shielded),
    })
    await expect(readMidnightBalanceAmounts(wallet, registry)).resolves.toEqual(expected)
  })

  test('a failed read rejects instead of reporting zero', async () => {
    const wallet = mock<Wallet>('wallet', {
      getShieldedBalances: () => Promise.reject(new Error('Wallet is still synchronising.')),
    })
    await expect(readMidnightBalanceAmounts(wallet, registry)).rejects.toThrow(
      'Wallet is still synchronising.',
    )
  })
})
