'use server'

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
  callerAddress: string,
  args: PrepareStartWithdrawArgs,
): Promise<WithdrawStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.prepareStartWithdraw(
    callerAddress,
    args,
  )
}

export async function startWithdraw(
  callerAddress: string,
  args: StartWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.startWithdraw(
    callerAddress,
    args,
  )
}

export async function prepareCompleteWithdraw(
  callerAddress: string,
  args: PrepareCompleteWithdrawArgs,
): Promise<WithdrawCompleteInputsResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.withdrawV1.adaptor.prepareCompleteWithdraw(callerAddress, args)
}

export async function completeWithdraw(
  callerAddress: string,
  args: CompleteWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.completeWithdraw(
    callerAddress,
    args,
  )
}

export async function getWithdraw(
  callerAddress: string,
  args: GetWithdrawArgs,
): Promise<WithdrawResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.getWithdraw(
    callerAddress,
    args,
  )
}

export async function listWithdraws(
  callerAddress: string,
  args: ListWithdrawsArgs,
): Promise<WithdrawListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.withdrawV1.adaptor.listWithdraws(
    callerAddress,
    args,
  )
}
