import { CIRCLE_EURC, CIRCLE_USDC } from '@sig-net/midnight-examples-erc20-vault-contract'
import { describe, expect, test } from 'vitest'

import {
  vaultTokenInfos,
  vaultTokenType,
} from '@/lib/midnight/ethereum-erc20-vault/vault-token-infos'

const VAULT_ADDRESS = '0'.repeat(64)
const SEPOLIA = 11155111
const LOCAL = 31337
const MAINNET = 1

/** Pinned from one run of the derivation: a change here is a change to every minted token's identity. */
const PINNED_TOKEN_TYPES: { erc20Address: string; tokenType: string }[] = [
  {
    erc20Address: CIRCLE_USDC,
    tokenType: '8afea6a86a87d6cbb80bbf0ff1a25e8ca54c8412fbf2595ef69b43b1da8346ca',
  },
  {
    erc20Address: CIRCLE_EURC,
    tokenType: 'ae147c217d6e96297e194ec6648c7637cf7078f96f56c3153b123d6fca3fa818',
  },
]

describe('vaultTokenType', () => {
  test.each(PINNED_TOKEN_TYPES)(
    'derives $tokenType for $erc20Address',
    ({ erc20Address, tokenType }) => {
      expect(vaultTokenType(erc20Address, VAULT_ADDRESS)).toBe(tokenType)
    },
  )

  test('a different vault mints a different token type', () => {
    expect(vaultTokenType(CIRCLE_USDC, `${'0'.repeat(63)}1`)).not.toBe(
      vaultTokenType(CIRCLE_USDC, VAULT_ADDRESS),
    )
  })
})

describe('vaultTokenInfos', () => {
  test.each([
    { name: 'Sepolia', chainId: SEPOLIA, count: 6 },
    { name: 'the local fork', chainId: LOCAL, count: 6 },
    { name: 'mainnet', chainId: MAINNET, count: 0 },
  ])('$name lists $count tokens', ({ chainId, count }) => {
    const infos = vaultTokenInfos(VAULT_ADDRESS, chainId)
    expect(infos).toHaveLength(count)
    expect(new Set(infos.map((info) => info.id.tokenType)).size).toBe(count)
    for (const info of infos) {
      expect(info.id.ledger).toBe('shielded')
      expect(info.id.tokenType).toMatch(/^[0-9a-f]{64}$/)
      expect(info.origin).toMatchObject({ kind: 'ethereum-erc20-vault', chainId })
    }
  })

  test('the USDC entry carries the ERC20 decimals and the pinned token type', () => {
    const usdc = vaultTokenInfos(VAULT_ADDRESS, SEPOLIA).find(
      (info) => info.origin.erc20Address === CIRCLE_USDC,
    )
    expect(usdc).toMatchObject({
      id: { ledger: 'shielded', tokenType: PINNED_TOKEN_TYPES[0]?.tokenType },
      symbol: 'USDC',
      decimals: 6,
      icon: { source: 'web3icons', name: 'USDC' },
      supported: false,
      pricing: { kind: 'coin', coinId: 'usd-coin' },
    })
  })

  test('the allowlist marks bundled tokens supported and adds the unlisted ones without artwork', () => {
    const unlisted = `0x${'ab'.repeat(20)}`
    const infos = vaultTokenInfos(VAULT_ADDRESS, SEPOLIA, [
      { erc20Address: CIRCLE_USDC.toLowerCase(), symbol: 'USDC', name: 'USDC', decimals: 6 },
      { erc20Address: unlisted, symbol: 'NEW', name: 'New Token', decimals: 18 },
    ])
    const byAddress = (address: string) =>
      infos.find((info) => info.origin.erc20Address.toLowerCase() === address.toLowerCase())
    expect(byAddress(CIRCLE_USDC)).toMatchObject({
      symbol: 'USDC',
      name: 'USD Coin',
      supported: true,
      pricing: { kind: 'coin', coinId: 'usd-coin' },
    })
    expect(byAddress(CIRCLE_EURC)).toMatchObject({ supported: false })
    expect(byAddress(unlisted)).toMatchObject({
      symbol: 'NEW',
      name: 'New Token',
      decimals: 18,
      icon: { source: 'none' },
      supported: true,
      pricing: null,
    })
    expect(infos.filter((info) => info.supported)).toHaveLength(2)
  })
})
