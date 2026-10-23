import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import type { DepositAccountFund } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/deposit-account-fund'
import type { SupportedToken } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token'
import { userCommitmentSchema } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'

/**
 * What the vault admits and what a caller holds of it on Ethereum. The allowlist is vault-level
 * public state, so its read takes no caller; the funds read is the caller's own deposit account.
 */
export interface SupportedTokenService {
  /** The vault's allowlist in ledger order, each token with the metadata its contract reports. */
  listSupportedTokens(args: ListSupportedTokensArgs): Promise<SupportedToken[]>
  /** The supported tokens the caller's deposit account holds above zero, in allowlist order. */
  listDepositAccountFunds(
    caller: Caller,
    args: ListDepositAccountFundsArgs,
  ): Promise<DepositAccountFund[]>
}

export const listSupportedTokensArgsSchema = z.object({})
export type ListSupportedTokensArgs = z.infer<typeof listSupportedTokensArgsSchema>

/** The commitment of the vault secret picks the deposit account whose funds are read. */
export const listDepositAccountFundsArgsSchema = z.object({ userCommitment: userCommitmentSchema })
export type ListDepositAccountFundsArgs = z.infer<typeof listDepositAccountFundsArgsSchema>
