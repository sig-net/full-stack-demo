import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import type { VaultReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'

/** Whether the payers the backend can see hold what an action costs them. */
export interface ReadinessService {
  /** The relayer's DUST, the caller's deposit account's ETH and the vault account's ETH, each read afresh. */
  getVaultReadiness(caller: Caller, args: GetVaultReadinessArgs): Promise<VaultReadiness>
}

export const getVaultReadinessArgsSchema = z.object({})
export type GetVaultReadinessArgs = z.infer<typeof getVaultReadinessArgsSchema>
