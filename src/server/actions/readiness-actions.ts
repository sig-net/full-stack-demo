'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
  credential: LoginCredential,
  args: GetVaultReadinessArgs,
): Promise<VaultReadinessResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.readinessV1.adaptor.getVaultReadiness(
    credential,
    args,
  )
}

export async function getVaultInitialisation(
  credential: LoginCredential,
  args: GetVaultInitialisationArgs,
): Promise<VaultInitialisationResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.readinessV1.adaptor.getVaultInitialisation(credential, args)
}
