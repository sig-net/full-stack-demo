'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
import type {
  CompleteWithdrawArgs,
  GetWithdrawArgs,
  ListWithdrawsArgs,
  PrepareCompleteWithdrawArgs,
  PrepareStartWithdrawArgs,
  StartWithdrawArgs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import type {
  WithdrawCompleteInputsResult,
  WithdrawListResult,
  WithdrawResult,
  WithdrawStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-adaptor'
import { getBackend } from '@/server/backend'

export async function prepareStartWithdraw(
  credential: LoginCredential,
  args: PrepareStartWithdrawArgs,
): Promise<WithdrawStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.prepareStartWithdraw(
    credential,
    args,
  )
}

export async function startWithdraw(
  credential: LoginCredential,
  args: StartWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.startWithdraw(
    credential,
    args,
  )
}

export async function prepareCompleteWithdraw(
  credential: LoginCredential,
  args: PrepareCompleteWithdrawArgs,
): Promise<WithdrawCompleteInputsResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.withdrawV1.adaptor.prepareCompleteWithdraw(credential, args)
}

export async function completeWithdraw(
  credential: LoginCredential,
  args: CompleteWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.completeWithdraw(
    credential,
    args,
  )
}

export async function getWithdraw(
  credential: LoginCredential,
  args: GetWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.getWithdraw(
    credential,
    args,
  )
}

export async function listWithdraws(
  credential: LoginCredential,
  args: ListWithdrawsArgs,
): Promise<WithdrawListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.listWithdraws(
    credential,
    args,
  )
}
