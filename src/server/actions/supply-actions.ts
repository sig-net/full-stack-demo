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
  callerSecret: string,
  args: GetSupplyTargetArgs,
): Promise<SupplyTargetResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.getSupplyTarget(
    callerSecret,
    args,
  )
}

export async function prepareStartSupply(
  callerSecret: string,
  args: PrepareStartSupplyArgs,
): Promise<SupplyStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.prepareStartSupply(
    callerSecret,
    args,
  )
}

export async function startSupply(
  callerSecret: string,
  args: StartSupplyArgs,
): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.startSupply(
    callerSecret,
    args,
  )
}

export async function prepareCompleteSupply(
  callerSecret: string,
  args: PrepareCompleteSupplyArgs,
): Promise<SupplyCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.prepareCompleteSupply(
    callerSecret,
    args,
  )
}

export async function completeSupply(
  callerSecret: string,
  args: CompleteSupplyArgs,
): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.completeSupply(
    callerSecret,
    args,
  )
}

export async function getSupply(callerSecret: string, args: GetSupplyArgs): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.getSupply(
    callerSecret,
    args,
  )
}

export async function listSupplies(
  callerSecret: string,
  args: ListSuppliesArgs,
): Promise<SupplyListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.listSupplies(
    callerSecret,
    args,
  )
}
