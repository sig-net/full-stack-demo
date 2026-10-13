import { hexToBytes } from '@sig-net/midnight'
import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import { SupportedTokenServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token-service-impl'
import type { AllowedTokenLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import { ledgerSet } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'
import { mock } from '@/lib/testing/mock'

/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET: MidnightSignetConfig = {
  contractAddress: '11'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'22'.repeat(32)}`, false),
}
const VAULT: MidnightEthereumErc20VaultConfig = { contractAddress: '33'.repeat(32) }
const caller: Caller = resolveCaller('ab'.repeat(32))
const ACCOUNT = depositAccountOf(caller, SIGNET, VAULT)

const USDC = `0x${'aa'.repeat(20)}`
const EURC = `0x${'bb'.repeat(20)}`
const METADATA = {
  [USDC]: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  [EURC]: { symbol: 'EURC', name: 'Euro Coin', decimals: 6 },
}

function serviceOver(
  allowed: string[],
  balances: Record<string, bigint>,
  reads: string[] = [],
): SupportedTokenServiceImpl {
  const ledger = mock<AllowedTokenLedger>('AllowedTokenLedger', {
    state: () =>
      Promise.resolve({
        allowedTokens: ledgerSet(allowed.map((address) => hexToBytes(address.slice(2)))),
      }),
  })
  const reader = mock<Erc20Reader>('Erc20Reader', {
    metadata: (erc20Address) => {
      const metadata = METADATA[erc20Address]
      if (metadata === undefined) throw new Error(`no metadata for ${erc20Address}`)
      return Promise.resolve(metadata)
    },
    balanceOf: (erc20Address, holder) => {
      reads.push(`${erc20Address}@${holder}`)
      return Promise.resolve(balances[erc20Address] ?? 0n)
    },
  })
  return new SupportedTokenServiceImpl(ledger, reader, SIGNET, VAULT)
}

describe('SupportedTokenServiceImpl', () => {
  test.each([
    { name: 'an empty allowlist lists nothing', allowed: [], expected: [] },
    {
      name: 'each allowed token carries the metadata its contract reports, in allowlist order',
      allowed: [EURC, USDC],
      expected: [
        { erc20Address: EURC, ...METADATA[EURC] },
        { erc20Address: USDC, ...METADATA[USDC] },
      ],
    },
  ])('listSupportedTokens: $name', async ({ allowed, expected }) => {
    await expect(serviceOver(allowed, {}).listSupportedTokens({})).resolves.toEqual(expected)
  })

  test.each([
    { name: 'nothing held lists no funds', allowed: [USDC, EURC], balances: {}, expected: [] },
    {
      name: 'only balances above zero are funds',
      allowed: [USDC, EURC],
      balances: { [USDC]: 122_000_000n, [EURC]: 0n },
      expected: [{ erc20Address: USDC, amount: 122_000_000n }],
    },
  ])('listDepositAccountFunds: $name', async ({ allowed, balances, expected }) => {
    const reads: string[] = []
    const funds = await serviceOver(allowed, balances, reads).listDepositAccountFunds(caller, {})
    expect(funds).toEqual(expected)
    expect(reads).toEqual(allowed.map((address) => `${address}@${ACCOUNT}`))
  })
})
