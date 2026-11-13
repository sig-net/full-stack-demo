import 'server-only'

import { bytesToHex, stripHexPrefix } from '@sig-net/midnight'

import type { Caller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import type { DepositAccountFund } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/deposit-account-fund'
import type { SupportedToken } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token'
import type {
  ListDepositAccountFundsArgs,
  ListSupportedTokensArgs,
  SupportedTokenService,
} from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token-service'
import type { AllowedTokenLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'

export class SupportedTokenServiceImpl implements SupportedTokenService {
  private readonly ledger: AllowedTokenLedger
  private readonly erc20Reader: Erc20Reader
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    ledger: AllowedTokenLedger,
    erc20Reader: Erc20Reader,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.ledger = ledger
    this.erc20Reader = erc20Reader
    this.signet = signet
    this.vault = vault
  }

  async listSupportedTokens(_args: ListSupportedTokensArgs): Promise<SupportedToken[]> {
    const allowed = await this.allowedTokens()
    return Promise.all(
      allowed.map(async ({ erc20Address, fees }) => ({
        erc20Address,
        ...(await this.erc20Reader.metadata(erc20Address)),
        fees,
      })),
    )
  }

  async listDepositAccountFunds(
    _caller: Caller,
    { userCommitment }: ListDepositAccountFundsArgs,
  ): Promise<DepositAccountFund[]> {
    const account = depositAccountOf(userCommitment, this.signet, this.vault)
    const allowed = await this.allowedTokens()
    const balances = await Promise.all(
      allowed.map(async ({ erc20Address }) => ({
        erc20Address,
        amount: await this.erc20Reader.balanceOf(erc20Address, account),
      })),
    )
    return balances.filter((fund) => fund.amount > 0n)
  }

  /** The allowlist with lower-case `0x` addresses, the form every address in the application takes. */
  private async allowedTokens(): Promise<Pick<SupportedToken, 'erc20Address' | 'fees'>[]> {
    const { allowedTokens } = await this.ledger.state()
    return Array.from(allowedTokens, ([bytes, { fees }]) => ({
      erc20Address: `0x${stripHexPrefix(bytesToHex(bytes))}`.toLowerCase(),
      fees,
    }))
  }
}
