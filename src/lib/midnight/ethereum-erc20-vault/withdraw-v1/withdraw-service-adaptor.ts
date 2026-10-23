import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import type {
  Withdraw,
  WithdrawCompleteInputs,
  WithdrawStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import {
  completeWithdrawArgsSchema,
  getWithdrawArgsSchema,
  listWithdrawsArgsSchema,
  prepareCompleteWithdrawArgsSchema,
  prepareStartWithdrawArgsSchema,
  startWithdrawArgsSchema,
  type WithdrawService,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the withdraw service to the wire: the caller address stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after its row reads.
 */
export class WithdrawServiceAdaptor {
  private readonly withdrawService: WithdrawService
  private readonly networkId: MidnightNetworkId
  private readonly logger: Logger

  constructor(withdrawService: WithdrawService, networkId: MidnightNetworkId, logger: Logger) {
    this.withdrawService = withdrawService
    this.networkId = networkId
    this.logger = logger
  }

  async prepareStartWithdraw(
    callerAddress: string,
    args: unknown,
  ): Promise<WithdrawStartInputsResult> {
    const caller = resolveCaller(callerAddress, this.networkId)
    this.logger.debug('method called', { method: 'prepareStartWithdraw', caller: caller.name })
    const parsed = prepareStartWithdrawArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return {
      ok: true,
      inputs: await this.withdrawService.prepareStartWithdraw(caller, parsed.data),
    }
  }

  async startWithdraw(callerAddress: string, args: unknown): Promise<WithdrawResult> {
    const caller = resolveCaller(callerAddress, this.networkId)
    this.logger.debug('method called', { method: 'startWithdraw', caller: caller.name })
    const parsed = startWithdrawArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<WithdrawResult>(async () => ({
      ok: true,
      withdraw: await this.withdrawService.startWithdraw(caller, parsed.data),
    }))
  }

  async prepareCompleteWithdraw(
    callerAddress: string,
    args: unknown,
  ): Promise<WithdrawCompleteInputsResult> {
    const caller = resolveCaller(callerAddress, this.networkId)
    this.logger.debug('method called', { method: 'prepareCompleteWithdraw', caller: caller.name })
    const parsed = prepareCompleteWithdrawArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<WithdrawCompleteInputsResult>(async () => ({
      ok: true,
      inputs: await this.withdrawService.prepareCompleteWithdraw(caller, parsed.data),
    }))
  }

  async completeWithdraw(callerAddress: string, args: unknown): Promise<WithdrawResult> {
    const caller = resolveCaller(callerAddress, this.networkId)
    this.logger.debug('method called', { method: 'completeWithdraw', caller: caller.name })
    const parsed = completeWithdrawArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<WithdrawResult>(async () => ({
      ok: true,
      withdraw: await this.withdrawService.completeWithdraw(caller, parsed.data),
    }))
  }

  async getWithdraw(callerAddress: string, args: unknown): Promise<WithdrawResult> {
    const caller = resolveCaller(callerAddress, this.networkId)
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

  async listWithdraws(callerAddress: string, args: unknown): Promise<WithdrawListResult> {
    const caller = resolveCaller(callerAddress, this.networkId)
    this.logger.debug('method called', { method: 'listWithdraws', caller: caller.name })
    const parsed = listWithdrawsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, withdraws: await this.withdrawService.listWithdraws(caller, parsed.data) }
  }
}

export type WithdrawResult = { readonly ok: true; readonly withdraw: Withdraw } | Refused

export type WithdrawListResult = { readonly ok: true; readonly withdraws: Withdraw[] } | Refused

export type WithdrawStartInputsResult =
  | { readonly ok: true; readonly inputs: WithdrawStartInputs }
  | Refused

export type WithdrawCompleteInputsResult =
  | { readonly ok: true; readonly inputs: WithdrawCompleteInputs }
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
