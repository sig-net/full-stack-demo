'use server'

import type { GetVaultReadinessArgs } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service'
import type { VaultReadinessResult } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service-adaptor'
import { getBackend } from '@/server/backend'

export async function getVaultReadiness(
  callerSecret: string,
  args: GetVaultReadinessArgs,
): Promise<VaultReadinessResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.readinessV1.adaptor.getVaultReadiness(
    callerSecret,
    args,
  )
}
