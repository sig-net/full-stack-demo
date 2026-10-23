'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
  credential: LoginCredential,
  args: PrepareStartDepositArgs,
): Promise<DepositStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.prepareStartDeposit(
    credential,
    args,
  )
}

export async function startDeposit(
  credential: LoginCredential,
  args: StartDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.startDeposit(
    credential,
    args,
  )
}

export async function prepareCompleteDeposit(
  credential: LoginCredential,
  args: PrepareCompleteDepositArgs,
): Promise<DepositCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.prepareCompleteDeposit(
    credential,
    args,
  )
}

export async function completeDeposit(
  credential: LoginCredential,
  args: CompleteDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.completeDeposit(
    credential,
    args,
  )
}

export async function getDeposit(
  credential: LoginCredential,
  args: GetDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.getDeposit(
    credential,
    args,
  )
}

export async function listDeposits(
  credential: LoginCredential,
  args: ListDepositsArgs,
): Promise<DepositListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.listDeposits(
    credential,
    args,
  )
}
