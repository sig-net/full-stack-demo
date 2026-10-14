import { describe, expect, test } from 'vitest'

import { NO_ICON } from '@/lib/icon-source'
import type { DepositAccountFund } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/deposit-account-fund'
import { fundLabel } from '@/lib/tokens/fund-label'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

const CIRCLE = `0x${'11'.repeat(20)}`
const AAVE = `0x${'22'.repeat(20)}`
const EURC = `0x${'33'.repeat(20)}`
const NAMELESS = `0x${'44'.repeat(20)}`
const UNKNOWN = `0x${'55'.repeat(20)}`

function info(erc20Address: string, symbol: string, issuer?: string): TokenInfo {
  return {
    id: { ledger: 'shielded', tokenType: erc20Address.slice(2).repeat(4).slice(0, 64) },
    symbol,
    name: symbol,
    decimals: 6,
    icon: NO_ICON,
    origin: { kind: 'ethereum-erc20-vault', chainId: 1, erc20Address, issuer },
    supported: true,
    pricing: null,
  }
}

const registry = new TokenInfoRegistry([
  info(CIRCLE, 'USDC', 'Circle'),
  info(AAVE, 'USDC', 'Aave'),
  info(EURC, 'EURC', 'Circle'),
  info(NAMELESS, 'USDC'),
])
const fund = (erc20Address: string): DepositAccountFund => ({ erc20Address, amount: 1n })

describe('fundLabel', () => {
  test.each([
    {
      name: 'a symbol no other fund shares stands alone',
      funds: [fund(CIRCLE), fund(EURC)],
      expected: ['USDC', 'EURC'],
    },
    {
      name: 'a shared symbol is qualified by each issuer',
      funds: [fund(AAVE), fund(CIRCLE)],
      expected: ['USDC (Aave)', 'USDC (Circle)'],
    },
    {
      name: 'a shared symbol without an issuer falls back to the address',
      funds: [fund(CIRCLE), fund(NAMELESS)],
      expected: ['USDC (Circle)', 'USDC (0x4444…4444)'],
    },
    {
      name: 'a token the registry does not know shows its address',
      funds: [fund(UNKNOWN)],
      expected: ['0x5555…5555'],
    },
  ])('$name', ({ funds, expected }) => {
    expect(funds.map((entry) => fundLabel(entry, funds, registry))).toEqual(expected)
  })
})
