import { describe, expect, test } from 'vitest'

import { activityEntryOf, formatTimestamp } from '@/lib/activity/activity-entries'
import { NO_ICON } from '@/lib/icon-source'
import {
  activityFixture,
  withdrawActivityFixture,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-fixtures'
import { ERC20_ADDRESS } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import { BUNDLED_NETWORK_ICONS } from '@/lib/tokens/bundled-icons'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

const USDC: TokenInfo = {
  id: { ledger: 'shielded', tokenType: '11'.repeat(32) },
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  icon: { source: 'web3icons', name: 'USDC' },
  origin: { kind: 'ethereum-erc20-vault', chainId: 31337, erc20Address: ERC20_ADDRESS },
  supported: true,
}

describe('activityEntryOf', () => {
  test('names and scales a registered token on both sides', () => {
    const entry = activityEntryOf(activityFixture(), new TokenInfoRegistry([USDC]))
    expect(entry).toMatchObject({
      name: activityFixture().name,
      kind: 'deposit',
      status: 'pending',
      from: {
        assetSymbol: 'USDC',
        networkName: 'Ethereum',
        amount: '1',
        icon: USDC.icon,
        networkIcon: BUNDLED_NETWORK_ICONS.ethereum,
      },
      to: { kind: 'wallet', address: null, addressLabel: 'your wallet' },
      action: { kind: 'none' },
      error: null,
    })
    expect(entry.steps).toHaveLength(10)
  })

  test('a deposit with its recipient lands in that shielded wallet', () => {
    const entry = activityEntryOf(
      activityFixture({ destination: `mn_shield-addr_undeployed1${'q'.repeat(60)}` }),
      new TokenInfoRegistry([USDC]),
    )
    expect(entry.to).toEqual({
      kind: 'wallet',
      address: `mn_shield-addr_undeployed1${'q'.repeat(60)}`,
      addressLabel: 'qqqqqq…qqqq',
    })
  })

  test('a withdrawal is a send from the vault token on Midnight to the destination address', () => {
    const entry = activityEntryOf(withdrawActivityFixture(), new TokenInfoRegistry([USDC]))
    expect(entry).toMatchObject({
      kind: 'send',
      description: 'send of 1 USDC to 0xd1d1…d1d1',
      from: { assetSymbol: 'USDC', networkName: 'Ethereum', amount: '1' },
      to: { kind: 'wallet', address: `0x${'d1'.repeat(20)}`, addressLabel: '0xd1d1…d1d1' },
    })
  })

  test('falls back to the address and raw base units for an unregistered token', () => {
    const entry = activityEntryOf(activityFixture(), new TokenInfoRegistry([]))
    expect(entry.from).toMatchObject({
      assetSymbol: '0xefef…efef',
      amount: '1000000',
      icon: NO_ICON,
    })
  })

  test.each([
    { state: 'Pending', status: 'pending' },
    { state: 'Complete', status: 'complete' },
    { state: 'Failed', status: 'failed' },
  ] as const)('maps $state to $status', ({ state, status }) => {
    expect(activityEntryOf(activityFixture({ state }), new TokenInfoRegistry([])).status).toBe(
      status,
    )
  })
})

describe('formatTimestamp', () => {
  test('writes the design format', () => {
    expect(formatTimestamp(new Date(Date.UTC(2025, 6, 8, 19, 18)))).toMatch(
      /^July 8, 2025 \d{2}:\d{2} [AP]M$/,
    )
  })
})
