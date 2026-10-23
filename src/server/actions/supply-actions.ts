'use server'

import type {
  CompleteSupplyArgs,
  GetSupplyArgs,
  GetSupplyTargetArgs,
  ListSuppliesArgs,
  PrepareCompleteSupplyArgs,
  PrepareStartSupplyArgs,
  StartSupplyArgs,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import type {
  SupplyCompleteInputsResult,
  SupplyListResult,
  SupplyResult,
  SupplyStartInputsResult,
  SupplyTargetResult,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service-adaptor'
import { getBackend } from '@/server/backend'

export async function getSupplyTarget(
  callerAddress: string,
  args: GetSupplyTargetArgs,
): Promise<SupplyTargetResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.getSupplyTarget(
    callerAddress,
    args,
  )
}

export async function prepareStartSupply(
  callerAddress: string,
  args: PrepareStartSupplyArgs,
): Promise<SupplyStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.prepareStartSupply(
    callerAddress,
    args,
  )
}

export async function startSupply(
  callerAddress: string,
  args: StartSupplyArgs,
): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.startSupply(
    callerAddress,
    args,
  )
}

export async function prepareCompleteSupply(
  callerAddress: string,
  args: PrepareCompleteSupplyArgs,
): Promise<SupplyCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.prepareCompleteSupply(
    callerAddress,
    args,
  )
}

export async function completeSupply(
  callerAddress: string,
  args: CompleteSupplyArgs,
): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.completeSupply(
    callerAddress,
    args,
  )
}

export async function getSupply(callerAddress: string, args: GetSupplyArgs): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.getSupply(
    callerAddress,
    args,
  )
}

export async function listSupplies(
  callerAddress: string,
  args: ListSuppliesArgs,
): Promise<SupplyListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.listSupplies(
    callerAddress,
    args,
  )
}
