import { describe, expect, test } from 'vitest'

import { NO_ICON } from '@/lib/icon-source'
import type { TokenId } from '@/lib/tokens/token-id'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

const TOKEN_TYPE = `ab${'0'.repeat(62)}`

function info(id: TokenId, symbol: string): TokenInfo {
  return {
    id,
    symbol,
    name: symbol,
    decimals: 6,
    icon: NO_ICON,
    origin: { kind: 'ethereum-erc20-vault', chainId: 1, erc20Address: '0x', issuer: 'Test' },
    supported: false,
  }
}

const SHIELDED = info({ ledger: 'shielded', tokenType: TOKEN_TYPE }, 'SHD')
const UNSHIELDED = info({ ledger: 'unshielded', tokenType: TOKEN_TYPE }, 'UNS')

const cases: { name: string; lookup: TokenId; expected: TokenInfo | undefined }[] = [
  { name: 'a registered shielded token', lookup: SHIELDED.id, expected: SHIELDED },
  { name: 'the same raw type on the other ledger', lookup: UNSHIELDED.id, expected: UNSHIELDED },
  {
    name: 'an unknown token type',
    lookup: { ledger: 'shielded', tokenType: '0'.repeat(64) },
    expected: undefined,
  },
]

describe('TokenInfoRegistry', () => {
  const registry = new TokenInfoRegistry([SHIELDED, UNSHIELDED])

  test.each(cases)('get finds $name', ({ lookup, expected }) => {
    expect(registry.get(lookup)).toBe(expected)
  })

  test('the same identity registered twice is refused', () => {
    expect(() => new TokenInfoRegistry([SHIELDED, SHIELDED])).toThrow('registered twice')
  })
})

describe('TokenInfoRegistry by ERC20 and by support', () => {
  const supportedUsdc: TokenInfo = {
    ...info({ ledger: 'shielded', tokenType: `cd${'0'.repeat(62)}` }, 'USDC'),
    origin: { kind: 'ethereum-erc20-vault', chainId: 1, erc20Address: '0xAbCd', issuer: 'Circle' },
    supported: true,
  }
  const registry = new TokenInfoRegistry([SHIELDED, supportedUsdc])

  test('byErc20Address ignores letter case', () => {
    expect(registry.byErc20Address('0xabcd')).toBe(supportedUsdc)
  })

  test('supported lists only the tokens the allowlist admits', () => {
    expect(registry.supported()).toEqual([supportedUsdc])
  })

  test('the fingerprint changes when support changes', () => {
    const unsupported = new TokenInfoRegistry([SHIELDED, { ...supportedUsdc, supported: false }])
    expect(unsupported.fingerprint).not.toBe(registry.fingerprint)
  })
})
