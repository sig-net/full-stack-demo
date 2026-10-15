import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import {
  getVaultReadinessArgsSchema,
  type ReadinessService,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service'
import type { VaultReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import type { Logger } from '@/lib/logging/logger'

/** Adapts the readiness service to the wire: untrusted arguments are parsed and the caller secret resolved. */
export class ReadinessServiceAdaptor {
  private readonly readinessService: ReadinessService
  private readonly logger: Logger

  constructor(readinessService: ReadinessService, logger: Logger) {
    this.readinessService = readinessService
    this.logger = logger
  }

  async getVaultReadiness(callerSecret: string, args: unknown): Promise<VaultReadinessResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getVaultReadiness', caller: caller.name })
    const parsed = getVaultReadinessArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return {
      ok: true,
      readiness: await this.readinessService.getVaultReadiness(caller, parsed.data),
    }
  }
}

export type VaultReadinessResult =
  | { readonly ok: true; readonly readiness: VaultReadiness }
  | { readonly ok: false; readonly error: string }
