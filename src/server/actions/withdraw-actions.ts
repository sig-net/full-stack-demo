'use server'

import type {
  CompleteWithdrawArgs,
  GetWithdrawArgs,
  ListWithdrawsArgs,
  StartWithdrawArgs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import type {
  WithdrawListResult,
  WithdrawResult,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-adaptor'
import { getBackend } from '@/server/backend'

export async function startWithdraw(
  callerSecret: string,
  args: StartWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.startWithdraw(
    callerSecret,
    args,
  )
}

export async function completeWithdraw(
  callerSecret: string,
  args: CompleteWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.completeWithdraw(
    callerSecret,
    args,
  )
}

export async function getWithdraw(
  callerSecret: string,
  args: GetWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.getWithdraw(
    callerSecret,
    args,
  )
}

export async function listWithdraws(
  callerSecret: string,
  args: ListWithdrawsArgs,
): Promise<WithdrawListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.listWithdraws(
    callerSecret,
    args,
  )
}
