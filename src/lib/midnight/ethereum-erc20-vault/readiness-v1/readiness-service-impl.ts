import 'server-only'

import type { Caller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { EthereumAccountReader } from '@/lib/ethereum/account-reader'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import type {
  GetVaultInitialisationArgs,
  GetVaultReadinessArgs,
  ReadinessService,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service'
import {
  type InitialisationCheck,
  readBalanceCheck,
  readInitialisationCheck,
  RELAYER_DUST_MINIMUM,
  type VaultReadiness,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { gasBudget, SWEEP_GAS } from '@/lib/midnight/ethereum-erc20-vault/sweep-gas'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import {
  assertVaultInitialised,
  VAULT_GAS_KINDS,
  type VaultGasLedger,
  type VaultGasLedgerState,
  vaultGasEnvelope,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'

export class ReadinessServiceImpl implements ReadinessService {
  private readonly ledger: VaultGasLedger
  private readonly accountReader: EthereumAccountReader
  private readonly relayerWallet: RelayerWallet
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    ledger: VaultGasLedger,
    accountReader: EthereumAccountReader,
    relayerWallet: RelayerWallet,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.ledger = ledger
    this.accountReader = accountReader
    this.relayerWallet = relayerWallet
    this.signet = signet
    this.vault = vault
  }

  async getVaultReadiness(caller: Caller, _args: GetVaultReadinessArgs): Promise<VaultReadiness> {
    const depositAccount = depositAccountOf(caller, this.signet, this.vault)
    const vaultAccount = vaultAccountOf(this.signet, this.vault)
    const [relayerDust, depositAccountEth, vaultAccountEth] = await Promise.all([
      readBalanceCheck('DUST', this.relayerWallet.unshieldedAddress(), async () => ({
        available: await this.relayerWallet.dustBalance(),
        required: RELAYER_DUST_MINIMUM,
      })),
      readBalanceCheck('ETH', depositAccount, async () => ({
        available: await this.accountReader.balance(depositAccount),
        required: gasBudget(SWEEP_GAS),
      })),
      readBalanceCheck('ETH', vaultAccount, async () => {
        const [available, state] = await Promise.all([
          this.accountReader.balance(vaultAccount),
          this.ledger.state(),
        ])
        assertVaultInitialised(state)
        return { available, required: largestVaultGasBudget(state) }
      }),
    ])
    return { relayerDust, depositAccountEth, vaultAccountEth }
  }

  getVaultInitialisation(
    _caller: Caller,
    _args: GetVaultInitialisationArgs,
  ): Promise<InitialisationCheck> {
    return readInitialisationCheck(() => this.ledger.state())
  }
}

/** The vault account is ready for any kind it signs once it covers the costliest, so one check serves them all. */
function largestVaultGasBudget(state: VaultGasLedgerState): bigint {
  return VAULT_GAS_KINDS.map((kind) => gasBudget(vaultGasEnvelope(state, kind))).reduce(
    (largest, budget) => (budget > largest ? budget : largest),
    0n,
  )
}
