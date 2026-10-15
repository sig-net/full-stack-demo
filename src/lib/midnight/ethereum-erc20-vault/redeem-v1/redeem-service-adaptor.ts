import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import type { Redeem } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import {
  completeRedeemArgsSchema,
  getRedeemArgsSchema,
  listRedeemsArgsSchema,
  startRedeemArgsSchema,
  type RedeemService,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service'
import { circuitAssertMessage } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the redeem service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after the circuit build.
 */
export class RedeemServiceAdaptor {
  private readonly redeemService: RedeemService
  private readonly logger: Logger

  constructor(redeemService: RedeemService, logger: Logger) {
    this.redeemService = redeemService
    this.logger = logger
  }

  async startRedeem(callerSecret: string, args: unknown): Promise<RedeemResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'startRedeem', caller: caller.name })
    const parsed = startRedeemArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.redeemService.startRedeem(caller, parsed.data))
  }

  async completeRedeem(callerSecret: string, args: unknown): Promise<RedeemResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'completeRedeem', caller: caller.name })
    const parsed = completeRedeemArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.redeemService.completeRedeem(caller, parsed.data))
  }

  async getRedeem(callerSecret: string, args: unknown): Promise<RedeemResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getRedeem', caller: caller.name })
    const parsed = getRedeemArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const redeem = await this.redeemService.getRedeem(caller, parsed.data)
    if (redeem === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, redeem }
  }

  async listRedeems(callerSecret: string, args: unknown): Promise<RedeemListResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'listRedeems', caller: caller.name })
    const parsed = listRedeemsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, redeems: await this.redeemService.listRedeems(caller, parsed.data) }
  }
}

export type RedeemResult =
  | { readonly ok: true; readonly redeem: Redeem }
  | { readonly ok: false; readonly error: string }

export type RedeemListResult =
  | { readonly ok: true; readonly redeems: Redeem[] }
  | { readonly ok: false; readonly error: string }

/** A state conflict and a contract assert firing at build time are the vault refusing the call, which the caller can act on. */
async function outcomeOf(action: () => Promise<Redeem>): Promise<RedeemResult> {
  try {
    return { ok: true, redeem: await action() }
  } catch (error: unknown) {
    if (error instanceof CallerOperationStateConflict) return { ok: false, error: error.message }
    const refusal = circuitAssertMessage(error)
    if (refusal !== undefined) return { ok: false, error: refusal }
    throw error
  }
}
