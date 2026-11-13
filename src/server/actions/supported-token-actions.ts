'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
import type {
  DepositAccountFundListResult,
  SupportedTokenListResult,
} from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token-service-adaptor'
import type {
  ListDepositAccountFundsArgs,
  ListSupportedTokensArgs,
} from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token-service'
import { getBackend } from '@/server/backend'

export async function listSupportedTokens(
  args: ListSupportedTokensArgs,
): Promise<SupportedTokenListResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.supportedTokenV1.adaptor.listSupportedTokens(args)
}

export async function listDepositAccountFunds(
  credential: LoginCredential,
  args: ListDepositAccountFundsArgs,
): Promise<DepositAccountFundListResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.supportedTokenV1.adaptor.listDepositAccountFunds(credential, args)
}
