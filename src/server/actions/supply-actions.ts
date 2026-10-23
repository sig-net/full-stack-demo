'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
  credential: LoginCredential,
  args: GetSupplyTargetArgs,
): Promise<SupplyTargetResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.getSupplyTarget(
    credential,
    args,
  )
}

export async function prepareStartSupply(
  credential: LoginCredential,
  args: PrepareStartSupplyArgs,
): Promise<SupplyStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.prepareStartSupply(
    credential,
    args,
  )
}

export async function startSupply(
  credential: LoginCredential,
  args: StartSupplyArgs,
): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.startSupply(
    credential,
    args,
  )
}

export async function prepareCompleteSupply(
  credential: LoginCredential,
  args: PrepareCompleteSupplyArgs,
): Promise<SupplyCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.prepareCompleteSupply(
    credential,
    args,
  )
}

export async function completeSupply(
  credential: LoginCredential,
  args: CompleteSupplyArgs,
): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.completeSupply(
    credential,
    args,
  )
}

export async function getSupply(
  credential: LoginCredential,
  args: GetSupplyArgs,
): Promise<SupplyResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.getSupply(
    credential,
    args,
  )
}

export async function listSupplies(
  credential: LoginCredential,
  args: ListSuppliesArgs,
): Promise<SupplyListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.supplyV1.adaptor.listSupplies(
    credential,
    args,
  )
}
