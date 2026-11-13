import { describe, expect, test } from 'vitest'

import type { SupportedBalance } from '@/lib/balances/supported-balances'
import {
  maxSurrenderAmount,
  surrenderAmountOf,
  vaultFeeNotice,
} from '@/lib/balances/surrender-amount'
import { NO_ICON } from '@/lib/icon-source'

/** 10 USDC held. */
const SOURCE: SupportedBalance = {
  token: {
    id: { ledger: 'shielded', tokenType: 'aa'.repeat(32) },
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    icon: NO_ICON,
    origin: { kind: 'ethereum-erc20-vault', chainId: 1, erc20Address: `0x${'aa'.repeat(20)}` },
    supported: true,
    vaultFees: { withdraw: 1_000n, swap: 1_000n, supply: 1_000n, redeem: 1_000n },
    pricing: null,
  },
  balance: {
    tokenType: 'aa'.repeat(32),
    baseUnits: 10_000_000n,
    assetSymbol: 'USDC',
    networkName: 'Ethereum',
    amount: '10',
    usdValue: null,
    icon: NO_ICON,
    networkIcon: NO_ICON,
  },
}

describe('surrenderAmountOf', () => {
  test.each([
    {
      name: 'an empty field is no amount',
      text: '',
      fee: 1_000n,
      expected: { value: null, error: null },
    },
    { name: 'zero is no amount', text: '0', fee: 1_000n, expected: { value: null, error: null } },
    {
      name: 'an amount the balance covers with the fee on top',
      text: '9.999',
      fee: 1_000n,
      expected: { value: 9_999_000n, error: null },
    },
    {
      name: 'the whole balance is accepted when the vault charges nothing',
      text: '10',
      fee: 0n,
      expected: { value: 10_000_000n, error: null },
    },
    {
      name: 'the whole balance is refused once the fee is added',
      text: '10',
      fee: 1_000n,
      expected: {
        value: null,
        error: 'That plus the 0.001 USDC vault fee is more than your 10 USDC.',
      },
    },
    {
      name: 'more than the balance is refused without a fee',
      text: '10.000001',
      fee: 0n,
      expected: { value: null, error: 'That is more than your 10 USDC.' },
    },
    {
      name: 'nothing is accepted while the fee is unread',
      text: '1',
      fee: null,
      expected: { value: null, error: "The vault's fee for USDC has not been read yet." },
    },
  ])('$name', ({ text, fee, expected }) => {
    expect(surrenderAmountOf(text, SOURCE, fee)).toEqual(expected)
  })
})

describe('maxSurrenderAmount', () => {
  test.each([
    { name: 'the balance less the fee', fee: 1_000n, expected: '9.999' },
    { name: 'the whole balance when the vault charges nothing', fee: 0n, expected: '10' },
    { name: 'zero when the fee alone exceeds the balance', fee: 20_000_000n, expected: '0' },
    { name: 'the whole balance while the fee is unread', fee: null, expected: '10' },
  ])('$name', ({ fee, expected }) => {
    expect(maxSurrenderAmount(SOURCE, fee)).toBe(expected)
  })
})

describe('vaultFeeNotice', () => {
  test.each([
    {
      name: 'a fee in whole tokens',
      fee: 1_000n,
      expected: 'Vault fee: 0.001 USDC, taken on top of the amount.',
    },
    { name: 'no fee', fee: 0n, expected: 'Vault fee: 0 USDC, taken on top of the amount.' },
    { name: 'an unread fee', fee: null, expected: 'Reading the vault fee for USDC…' },
  ])('$name', ({ fee, expected }) => {
    expect(vaultFeeNotice(fee, 'USDC', 6)).toBe(expected)
  })
})
