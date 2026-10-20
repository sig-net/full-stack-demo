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
  callerSecret: string,
  args: PrepareStartDepositArgs,
): Promise<DepositStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.prepareStartDeposit(
    callerSecret,
    args,
  )
}

export async function startDeposit(
  callerSecret: string,
  args: StartDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.startDeposit(
    callerSecret,
    args,
  )
}

export async function prepareCompleteDeposit(
  callerSecret: string,
  args: PrepareCompleteDepositArgs,
): Promise<DepositCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.prepareCompleteDeposit(
    callerSecret,
    args,
  )
}

export async function completeDeposit(
  callerSecret: string,
  args: CompleteDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.completeDeposit(
    callerSecret,
    args,
  )
}

export async function getDeposit(
  callerSecret: string,
  args: GetDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.getDeposit(
    callerSecret,
    args,
  )
}

export async function listDeposits(
  callerSecret: string,
  args: ListDepositsArgs,
): Promise<DepositListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.listDeposits(
    callerSecret,
    args,
  )
}
