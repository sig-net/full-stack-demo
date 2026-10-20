import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import { circuitAssertMessage } from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import type { Withdraw } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import {
  completeWithdrawArgsSchema,
  getWithdrawArgsSchema,
  listWithdrawsArgsSchema,
  startWithdrawArgsSchema,
  type WithdrawService,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the withdraw service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after the circuit build.
 */
export class WithdrawServiceAdaptor {
  private readonly withdrawService: WithdrawService
  private readonly logger: Logger

  constructor(withdrawService: WithdrawService, logger: Logger) {
    this.withdrawService = withdrawService
    this.logger = logger
  }

  async startWithdraw(callerSecret: string, args: unknown): Promise<WithdrawResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'startWithdraw', caller: caller.name })
    const parsed = startWithdrawArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.withdrawService.startWithdraw(caller, parsed.data))
  }

  async completeWithdraw(callerSecret: string, args: unknown): Promise<WithdrawResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'completeWithdraw', caller: caller.name })
    const parsed = completeWithdrawArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.withdrawService.completeWithdraw(caller, parsed.data))
  }

  async getWithdraw(callerSecret: string, args: unknown): Promise<WithdrawResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getWithdraw', caller: caller.name })
    const parsed = getWithdrawArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const withdraw = await this.withdrawService.getWithdraw(caller, parsed.data)
    if (withdraw === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, withdraw }
  }

  async listWithdraws(callerSecret: string, args: unknown): Promise<WithdrawListResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'listWithdraws', caller: caller.name })
    const parsed = listWithdrawsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, withdraws: await this.withdrawService.listWithdraws(caller, parsed.data) }
  }
}

export type WithdrawResult =
  | { readonly ok: true; readonly withdraw: Withdraw }
  | { readonly ok: false; readonly error: string }

export type WithdrawListResult =
  | { readonly ok: true; readonly withdraws: Withdraw[] }
  | { readonly ok: false; readonly error: string }

/** A state conflict and a contract assert firing at build time are the vault refusing the call, which the caller can act on. */
async function outcomeOf(action: () => Promise<Withdraw>): Promise<WithdrawResult> {
  try {
    return { ok: true, withdraw: await action() }
  } catch (error: unknown) {
    if (error instanceof CallerOperationStateConflict) return { ok: false, error: error.message }
    const refusal = circuitAssertMessage(error)
    if (refusal !== undefined) return { ok: false, error: refusal }
    throw error
  }
}
