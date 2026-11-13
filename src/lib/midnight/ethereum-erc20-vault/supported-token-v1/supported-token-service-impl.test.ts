import { hexToBytes } from '@sig-net/midnight'
import type { TokenFees } from '@sig-net/midnight-examples-erc20-vault-contract'
import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { CALLER } from '@/lib/caller/caller-fixtures'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import { SupportedTokenServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token-service-impl'
import type { AllowedTokenLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import { allowedTokenMap, NO_FEES } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'
import { mock } from '@/lib/testing/mock'

/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET: MidnightSignetConfig = {
  signerContractAddress: '11'.repeat(32),
  responderContractAddress: '55'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'22'.repeat(32)}`, false),
}
const VAULT: MidnightEthereumErc20VaultConfig = { contractAddress: '33'.repeat(32) }
const caller: Caller = CALLER
const USER_COMMITMENT = 'ab'.repeat(32)
const ACCOUNT = depositAccountOf(USER_COMMITMENT, SIGNET, VAULT)

const USDC = `0x${'aa'.repeat(20)}`
const EURC = `0x${'bb'.repeat(20)}`
const METADATA = {
  [USDC]: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  [EURC]: { symbol: 'EURC', name: 'Euro Coin', decimals: 6 },
}

const FEES: TokenFees = { withdraw: 1_000n, swap: 2_000n, supply: 3_000n, redeem: 4_000n }

function serviceOver(
  allowed: string[],
  balances: Record<string, bigint>,
  reads: string[] = [],
  fees: TokenFees = NO_FEES,
): SupportedTokenServiceImpl {
  const ledger = mock<AllowedTokenLedger>('AllowedTokenLedger', {
    state: () =>
      Promise.resolve({
        allowedTokens: allowedTokenMap(
          allowed.map((address) => hexToBytes(address.slice(2))),
          fees,
        ),
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
    { name: 'an empty allowlist lists nothing', allowed: [], fees: NO_FEES, expected: [] },
    {
      name: 'each allowed token carries the metadata its contract reports, in allowlist order',
      allowed: [EURC, USDC],
      fees: NO_FEES,
      expected: [
        { erc20Address: EURC, ...METADATA[EURC], fees: NO_FEES },
        { erc20Address: USDC, ...METADATA[USDC], fees: NO_FEES },
      ],
    },
    {
      name: 'each allowed token carries the fees the ledger holds for it',
      allowed: [USDC],
      fees: FEES,
      expected: [{ erc20Address: USDC, ...METADATA[USDC], fees: FEES }],
    },
  ])('listSupportedTokens: $name', async ({ allowed, fees, expected }) => {
    await expect(serviceOver(allowed, {}, [], fees).listSupportedTokens({})).resolves.toEqual(
      expected,
    )
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
    const funds = await serviceOver(allowed, balances, reads).listDepositAccountFunds(caller, {
      userCommitment: USER_COMMITMENT,
    })
    expect(funds).toEqual(expected)
    expect(reads).toEqual(allowed.map((address) => `${address}@${ACCOUNT}`))
  })
})
