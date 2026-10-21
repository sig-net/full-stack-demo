import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import type {
  Redeem,
  RedeemCompleteInputs,
  RedeemStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import {
  completeRedeemArgsSchema,
  getRedeemArgsSchema,
  listRedeemsArgsSchema,
  prepareCompleteRedeemArgsSchema,
  prepareStartRedeemArgsSchema,
  type RedeemService,
  startRedeemArgsSchema,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the redeem service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after its reads.
 */
export class RedeemServiceAdaptor {
  private readonly redeemService: RedeemService
  private readonly logger: Logger

  constructor(redeemService: RedeemService, logger: Logger) {
    this.redeemService = redeemService
    this.logger = logger
  }

  async prepareStartRedeem(callerSecret: string, args: unknown): Promise<RedeemStartInputsResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'prepareStartRedeem', caller: caller.name })
    const parsed = prepareStartRedeemArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, inputs: await this.redeemService.prepareStartRedeem(caller, parsed.data) }
  }

  async startRedeem(callerSecret: string, args: unknown): Promise<RedeemResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'startRedeem', caller: caller.name })
    const parsed = startRedeemArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<RedeemResult>(async () => ({
      ok: true,
      redeem: await this.redeemService.startRedeem(caller, parsed.data),
    }))
  }

  async prepareCompleteRedeem(
    callerSecret: string,
    args: unknown,
  ): Promise<RedeemCompleteInputsResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'prepareCompleteRedeem', caller: caller.name })
    const parsed = prepareCompleteRedeemArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<RedeemCompleteInputsResult>(async () => ({
      ok: true,
      inputs: await this.redeemService.prepareCompleteRedeem(caller, parsed.data),
    }))
  }

  async completeRedeem(callerSecret: string, args: unknown): Promise<RedeemResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'completeRedeem', caller: caller.name })
    const parsed = completeRedeemArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<RedeemResult>(async () => ({
      ok: true,
      redeem: await this.redeemService.completeRedeem(caller, parsed.data),
    }))
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

export type RedeemResult = { readonly ok: true; readonly redeem: Redeem } | Refused

export type RedeemListResult = { readonly ok: true; readonly redeems: Redeem[] } | Refused

export type RedeemStartInputsResult =
  | { readonly ok: true; readonly inputs: RedeemStartInputs }
  | Refused

export type RedeemCompleteInputsResult =
  | { readonly ok: true; readonly inputs: RedeemCompleteInputs }
  | Refused

type Refused = { readonly ok: false; readonly error: string }

/** A state conflict is a refusal the caller can act on. */
async function outcomeOf<Result>(action: () => Promise<Result>): Promise<Result | Refused> {
  try {
    return await action()
  } catch (error: unknown) {
    if (error instanceof CallerOperationStateConflict) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}
