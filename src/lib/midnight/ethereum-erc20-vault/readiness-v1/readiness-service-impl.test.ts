import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { EthereumAccountReader } from '@/lib/ethereum/account-reader'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import { ReadinessServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service-impl'
import {
  type InitialisationCheck,
  RELAYER_DUST_MINIMUM,
  type VaultReadiness,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type {
  VaultGasLedger,
  VaultGasLedgerState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'
import { mock } from '@/lib/testing/mock'

/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET: MidnightSignetConfig = {
  contractAddress: '11'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'22'.repeat(32)}`, false),
}
const VAULT: MidnightEthereumErc20VaultConfig = { contractAddress: '33'.repeat(32) }
const caller: Caller = resolveCaller('ab'.repeat(32))
const DEPOSIT_ACCOUNT = depositAccountOf(caller, SIGNET, VAULT)
const VAULT_ACCOUNT = vaultAccountOf(SIGNET, VAULT)
const RELAYER_ADDRESS = 'mn_addr_undeployed1relayer'

/** The contract's defaults: 150 gwei ceiling, and swap the costliest kind at 700 000 gas. */
const GAS_STATE: VaultGasLedgerState = {
  initialised: true,
  vaultMaxFeePerGas: 150_000_000_000n,
  vaultMaxPriorityFeePerGas: 1_000_000_000n,
  vaultGasLimits: {
    withdraw: 100_000n,
    approve: 100_000n,
    swap: 700_000n,
    supply: 500_000n,
    redeem: 500_000n,
  },
}
const SWEEP_BUDGET = 100_000n * 30_000_000_000n
const LARGEST_VAULT_BUDGET = 700_000n * 150_000_000_000n

function serviceOver(doubles: {
  balances?: Record<string, bigint>
  balanceError?: Error
  dust?: bigint
  dustError?: Error
  ledgerError?: Error
  initialised?: boolean
}): ReadinessServiceImpl {
  const ledger = mock<VaultGasLedger>('VaultGasLedger', {
    state: () =>
      doubles.ledgerError === undefined
        ? Promise.resolve({ ...GAS_STATE, initialised: doubles.initialised ?? true })
        : Promise.reject(doubles.ledgerError),
  })
  const reader = mock<EthereumAccountReader>('EthereumAccountReader', {
    balance: (account) =>
      doubles.balanceError === undefined
        ? Promise.resolve(doubles.balances?.[account] ?? 0n)
        : Promise.reject(doubles.balanceError),
  })
  const relayer = mock<RelayerWallet>('RelayerWallet', {
    unshieldedAddress: () => RELAYER_ADDRESS,
    dustBalance: () =>
      doubles.dustError === undefined
        ? Promise.resolve(doubles.dust ?? 0n)
        : Promise.reject(doubles.dustError),
  })
  return new ReadinessServiceImpl(ledger, reader, relayer, SIGNET, VAULT)
}

describe('ReadinessServiceImpl.getVaultReadiness', () => {
  test.each<{ name: string; doubles: Parameters<typeof serviceOver>[0]; expected: VaultReadiness }>(
    [
      {
        name: 'every payer funded is ok, with the sweep budget and the costliest vault kind as requirements',
        doubles: {
          dust: RELAYER_DUST_MINIMUM,
          balances: { [DEPOSIT_ACCOUNT]: SWEEP_BUDGET, [VAULT_ACCOUNT]: LARGEST_VAULT_BUDGET },
        },
        expected: {
          relayerDust: {
            status: 'ok',
            asset: 'DUST',
            account: RELAYER_ADDRESS,
            available: RELAYER_DUST_MINIMUM,
            required: RELAYER_DUST_MINIMUM,
          },
          depositAccountEth: {
            status: 'ok',
            asset: 'ETH',
            account: DEPOSIT_ACCOUNT,
            available: SWEEP_BUDGET,
            required: SWEEP_BUDGET,
          },
          vaultAccountEth: {
            status: 'ok',
            asset: 'ETH',
            account: VAULT_ACCOUNT,
            available: LARGEST_VAULT_BUDGET,
            required: LARGEST_VAULT_BUDGET,
          },
        },
      },
      {
        name: 'empty accounts are insufficient, each against its own requirement',
        doubles: {},
        expected: {
          relayerDust: {
            status: 'insufficient',
            asset: 'DUST',
            account: RELAYER_ADDRESS,
            available: 0n,
            required: RELAYER_DUST_MINIMUM,
          },
          depositAccountEth: {
            status: 'insufficient',
            asset: 'ETH',
            account: DEPOSIT_ACCOUNT,
            available: 0n,
            required: SWEEP_BUDGET,
          },
          vaultAccountEth: {
            status: 'insufficient',
            asset: 'ETH',
            account: VAULT_ACCOUNT,
            available: 0n,
            required: LARGEST_VAULT_BUDGET,
          },
        },
      },
      {
        name: 'a failed chain read leaves both ETH checks unavailable and the relayer check standing',
        doubles: { dust: RELAYER_DUST_MINIMUM, balanceError: new Error('rpc down') },
        expected: {
          relayerDust: {
            status: 'ok',
            asset: 'DUST',
            account: RELAYER_ADDRESS,
            available: RELAYER_DUST_MINIMUM,
            required: RELAYER_DUST_MINIMUM,
          },
          depositAccountEth: {
            status: 'unavailable',
            asset: 'ETH',
            account: DEPOSIT_ACCOUNT,
            reason: 'rpc down',
          },
          vaultAccountEth: {
            status: 'unavailable',
            asset: 'ETH',
            account: VAULT_ACCOUNT,
            reason: 'rpc down',
          },
        },
      },
      {
        name: 'a relayer still synchronising and an unreadable ledger are each reported where they fail',
        doubles: {
          dustError: new Error('Wallet is still synchronising.'),
          ledgerError: new Error('indexer down'),
          balances: { [DEPOSIT_ACCOUNT]: SWEEP_BUDGET },
        },
        expected: {
          relayerDust: {
            status: 'unavailable',
            asset: 'DUST',
            account: RELAYER_ADDRESS,
            reason: 'Wallet is still synchronising.',
          },
          depositAccountEth: {
            status: 'ok',
            asset: 'ETH',
            account: DEPOSIT_ACCOUNT,
            available: SWEEP_BUDGET,
            required: SWEEP_BUDGET,
          },
          vaultAccountEth: {
            status: 'unavailable',
            asset: 'ETH',
            account: VAULT_ACCOUNT,
            reason: 'indexer down',
          },
        },
      },
      {
        name: 'an uninitialised vault leaves the vault account unchecked, since its gas envelope reads as zero',
        doubles: {
          initialised: false,
          dust: RELAYER_DUST_MINIMUM,
          balances: { [DEPOSIT_ACCOUNT]: SWEEP_BUDGET, [VAULT_ACCOUNT]: LARGEST_VAULT_BUDGET },
        },
        expected: {
          relayerDust: {
            status: 'ok',
            asset: 'DUST',
            account: RELAYER_ADDRESS,
            available: RELAYER_DUST_MINIMUM,
            required: RELAYER_DUST_MINIMUM,
          },
          depositAccountEth: {
            status: 'ok',
            asset: 'ETH',
            account: DEPOSIT_ACCOUNT,
            available: SWEEP_BUDGET,
            required: SWEEP_BUDGET,
          },
          vaultAccountEth: {
            status: 'unavailable',
            asset: 'ETH',
            account: VAULT_ACCOUNT,
            reason: 'The vault is not initialised: its deployer has not run initialise.',
          },
        },
      },
    ],
  )('$name', async ({ doubles, expected }) => {
    await expect(serviceOver(doubles).getVaultReadiness(caller, {})).resolves.toEqual(expected)
  })
})

describe('ReadinessServiceImpl.getVaultInitialisation', () => {
  test.each<{
    name: string
    doubles: Parameters<typeof serviceOver>[0]
    expected: InitialisationCheck
  }>([
    {
      name: 'an initialised ledger is ok, without waiting on the relayer',
      doubles: { dustError: new Error('Wallet is still synchronising.') },
      expected: { status: 'ok' },
    },
    {
      name: 'a ledger whose initialise has not run is uninitialised',
      doubles: { initialised: false },
      expected: { status: 'uninitialised' },
    },
    {
      name: 'an unreadable ledger is unavailable with the reason',
      doubles: { ledgerError: new Error('indexer down') },
      expected: { status: 'unavailable', reason: 'indexer down' },
    },
  ])('$name', async ({ doubles, expected }) => {
    await expect(serviceOver(doubles).getVaultInitialisation(caller, {})).resolves.toEqual(expected)
  })
})
