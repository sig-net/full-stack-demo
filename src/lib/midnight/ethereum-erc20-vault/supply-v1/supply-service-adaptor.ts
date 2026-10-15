import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import type { Supply, SupplyTarget } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import {
  completeSupplyArgsSchema,
  getSupplyArgsSchema,
  getSupplyTargetArgsSchema,
  listSuppliesArgsSchema,
  startSupplyArgsSchema,
  type SupplyService,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import { circuitAssertMessage } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the supply service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after the circuit build.
 */
export class SupplyServiceAdaptor {
  private readonly supplyService: SupplyService
  private readonly logger: Logger

  constructor(supplyService: SupplyService, logger: Logger) {
    this.supplyService = supplyService
    this.logger = logger
  }

  async getSupplyTarget(callerSecret: string, args: unknown): Promise<SupplyTargetResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getSupplyTarget', caller: caller.name })
    const parsed = getSupplyTargetArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, target: await this.supplyService.getSupplyTarget(caller, parsed.data) }
  }

  async startSupply(callerSecret: string, args: unknown): Promise<SupplyResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'startSupply', caller: caller.name })
    const parsed = startSupplyArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.supplyService.startSupply(caller, parsed.data))
  }

  async completeSupply(callerSecret: string, args: unknown): Promise<SupplyResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'completeSupply', caller: caller.name })
    const parsed = completeSupplyArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.supplyService.completeSupply(caller, parsed.data))
  }

  async getSupply(callerSecret: string, args: unknown): Promise<SupplyResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getSupply', caller: caller.name })
    const parsed = getSupplyArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const supply = await this.supplyService.getSupply(caller, parsed.data)
    if (supply === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, supply }
  }

  async listSupplies(callerSecret: string, args: unknown): Promise<SupplyListResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'listSupplies', caller: caller.name })
    const parsed = listSuppliesArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, supplies: await this.supplyService.listSupplies(caller, parsed.data) }
  }
}

export type SupplyResult =
  | { readonly ok: true; readonly supply: Supply }
  | { readonly ok: false; readonly error: string }

export type SupplyListResult =
  | { readonly ok: true; readonly supplies: Supply[] }
  | { readonly ok: false; readonly error: string }

export type SupplyTargetResult =
  | { readonly ok: true; readonly target: SupplyTarget }
  | { readonly ok: false; readonly error: string }

/** A state conflict and a contract assert firing at build time are the vault refusing the call, which the caller can act on. */
async function outcomeOf(action: () => Promise<Supply>): Promise<SupplyResult> {
  try {
    return { ok: true, supply: await action() }
  } catch (error: unknown) {
    if (error instanceof CallerOperationStateConflict) return { ok: false, error: error.message }
    const refusal = circuitAssertMessage(error)
    if (refusal !== undefined) return { ok: false, error: refusal }
    throw error
  }
}
