import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import {
  getVaultInitialisationArgsSchema,
  getVaultReadinessArgsSchema,
  type ReadinessService,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service'
import type {
  InitialisationCheck,
  VaultReadiness,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
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

  async getVaultInitialisation(
    callerSecret: string,
    args: unknown,
  ): Promise<VaultInitialisationResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getVaultInitialisation', caller: caller.name })
    const parsed = getVaultInitialisationArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return {
      ok: true,
      initialisation: await this.readinessService.getVaultInitialisation(caller, parsed.data),
    }
  }
}

export type VaultReadinessResult =
  | { readonly ok: true; readonly readiness: VaultReadiness }
  | { readonly ok: false; readonly error: string }

export type VaultInitialisationResult =
  | { readonly ok: true; readonly initialisation: InitialisationCheck }
  | { readonly ok: false; readonly error: string }
