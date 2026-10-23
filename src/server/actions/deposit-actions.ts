'use server'

import type {
  DepositCompleteInputsResult,
  DepositListResult,
  DepositResult,
  DepositStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import type {
  CompleteDepositArgs,
  GetDepositArgs,
  ListDepositsArgs,
  PrepareCompleteDepositArgs,
  PrepareStartDepositArgs,
  StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import { getBackend } from '@/server/backend'

export async function prepareStartDeposit(
  callerAddress: string,
  args: PrepareStartDepositArgs,
): Promise<DepositStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.prepareStartDeposit(
    callerAddress,
    args,
  )
}

export async function startDeposit(
  callerAddress: string,
  args: StartDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.startDeposit(
    callerAddress,
    args,
  )
}

export async function prepareCompleteDeposit(
  callerAddress: string,
  args: PrepareCompleteDepositArgs,
): Promise<DepositCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.prepareCompleteDeposit(
    callerAddress,
    args,
  )
}

export async function completeDeposit(
  callerAddress: string,
  args: CompleteDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.completeDeposit(
    callerAddress,
    args,
  )
}

export async function getDeposit(
  callerAddress: string,
  args: GetDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.getDeposit(
    callerAddress,
    args,
  )
}

export async function listDeposits(
  callerAddress: string,
  args: ListDepositsArgs,
): Promise<DepositListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.listDeposits(
    callerAddress,
    args,
  )
}
