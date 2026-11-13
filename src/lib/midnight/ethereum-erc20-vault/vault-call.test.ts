import { CompiledContract } from '@midnight-ntwrk/compact-js/effect'
import { bytesToHex, hexToBytes } from '@sig-net/midnight'
import {
  Contract,
  type TokenFees,
  type VaultLedgerState,
  type VaultPrivateState,
  witnesses,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { describe, expect, test } from 'vitest'

import {
  type StartFee,
  startFeeOf,
  startRedeemCallOptions,
  startSupplyCallOptions,
  startSwapCallOptions,
  startWithdrawCallOptions,
  type VaultCallProviders,
  type VaultContract,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import { allowedTokenMap, NO_FEES } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'
import { mock } from '@/lib/testing/mock'

const TOKEN = `0x${'aa'.repeat(20)}`
const OTHER_TOKEN = `0x${'bb'.repeat(20)}`
const FEES: TokenFees = { withdraw: 1_000n, swap: 2_000n, supply: 3_000n, redeem: 4_000n }
const RECIPIENT_COIN_KEY = new Uint8Array(32).fill(7)
const RECIPIENT_ENCRYPTION_KEY = new Uint8Array(32).fill(9)

const PROVIDERS = mock<VaultCallProviders>('VaultCallProviders', {
  compiledContract: CompiledContract.make<VaultContract, VaultPrivateState>(
    'erc20-vault',
    Contract,
  ).pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets('/')),
  vaultAddress: '33'.repeat(32),
})

function ledgerCharging(fees: TokenFees): VaultLedgerState {
  return mock<VaultLedgerState>('VaultLedgerState', {
    allowedTokens: allowedTokenMap([hexToBytes(TOKEN.slice(2))], fees),
    feeRecipientCoinPublicKey: { bytes: RECIPIENT_COIN_KEY },
    feeRecipientEncryptionPublicKey: RECIPIENT_ENCRYPTION_KEY,
  })
}

const CALLER = {
  secretKey: new Uint8Array(32),
  wallet: { coinPublicKey: '', encryptionPublicKey: '' },
}

interface Case {
  name: string
  fees: TokenFees
  action: keyof TokenFees
  /** The surrendered coin's value and the encryption keys the call options carry. */
  build: (fee: StartFee) => { value: bigint; keys: ReadonlyMap<string, string> | undefined }
  expectValue: bigint
}

const ACTIONS: {
  action: keyof TokenFees
  principal: bigint
  build: Case['build']
}[] = [
  {
    action: 'withdraw',
    principal: 500n,
    build: (fee) => {
      const options = startWithdrawCallOptions(
        PROVIDERS,
        { ...CALLER, inIndex: 1n, erc20Address: TOKEN, destEvmAddress: OTHER_TOKEN, amount: 500n },
        fee,
      )
      return { value: options.args[2].value, keys: options.additionalCoinEncPublicKeyMappings }
    },
  },
  {
    action: 'swap',
    principal: 600n,
    build: (fee) => {
      const options = startSwapCallOptions(
        PROVIDERS,
        {
          ...CALLER,
          inIndex: 1n,
          erc20AddressIn: TOKEN,
          erc20AddressOut: OTHER_TOKEN,
          fee: 500n,
          amountOut: 10n,
          amountInMaximum: 600n,
        },
        fee,
      )
      return { value: options.args[2].value, keys: options.additionalCoinEncPublicKeyMappings }
    },
  },
  {
    action: 'supply',
    principal: 700n,
    build: (fee) => {
      const options = startSupplyCallOptions(
        PROVIDERS,
        { ...CALLER, inIndex: 1n, amount: 700n, underlyingErc20Address: TOKEN },
        fee,
      )
      return { value: options.args[2].value, keys: options.additionalCoinEncPublicKeyMappings }
    },
  },
  {
    action: 'redeem',
    principal: 800n,
    build: (fee) => {
      const options = startRedeemCallOptions(
        PROVIDERS,
        { ...CALLER, inIndex: 1n, shares: 800n, stataErc20Address: TOKEN },
        fee,
      )
      return { value: options.args[2].value, keys: options.additionalCoinEncPublicKeyMappings }
    },
  },
]

const cases: Case[] = ACTIONS.flatMap(({ action, principal, build }) => [
  {
    name: `${action} surrenders the principal plus the ledger's ${action} fee`,
    fees: FEES,
    action,
    build,
    expectValue: principal + FEES[action],
  },
  {
    name: `${action} surrenders the principal alone when the ledger charges nothing`,
    fees: NO_FEES,
    action,
    build,
    expectValue: principal,
  },
])

describe('start call options', () => {
  test.each(cases)('$name', ({ fees, action, build, expectValue }) => {
    const fee = startFeeOf(ledgerCharging(fees), hexToBytes(TOKEN.slice(2)), action)
    expect(fee.amount).toBe(fees[action])
    const built = build(fee)
    expect(built.value).toBe(expectValue)
    expect(built.keys).toEqual(
      new Map([[bytesToHex(RECIPIENT_COIN_KEY), bytesToHex(RECIPIENT_ENCRYPTION_KEY)]]),
    )
  })

  test('a token the vault does not allow has no fee', () => {
    expect(() =>
      startFeeOf(ledgerCharging(FEES), hexToBytes(OTHER_TOKEN.slice(2)), 'withdraw'),
    ).toThrow('does not allow')
  })
})
