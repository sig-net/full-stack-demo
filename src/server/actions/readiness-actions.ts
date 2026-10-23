'use server'

import type {
  GetVaultInitialisationArgs,
  GetVaultReadinessArgs,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service'
import type {
  VaultInitialisationResult,
  VaultReadinessResult,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service-adaptor'
import { getBackend } from '@/server/backend'

export async function getVaultReadiness(
  callerAddress: string,
  args: GetVaultReadinessArgs,
): Promise<VaultReadinessResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.readinessV1.adaptor.getVaultReadiness(
    callerAddress,
    args,
  )
}

export async function getVaultInitialisation(
  callerAddress: string,
  args: GetVaultInitialisationArgs,
): Promise<VaultInitialisationResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.readinessV1.adaptor.getVaultInitialisation(callerAddress, args)
}
