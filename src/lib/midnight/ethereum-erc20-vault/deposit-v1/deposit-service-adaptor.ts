import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type {
  Deposit,
  DepositCompleteInputs,
  DepositStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  completeDepositArgsSchema,
  DepositCallMismatch,
  DepositNonceConflict,
  DepositRecipientMismatch,
  type DepositService,
  getDepositArgsSchema,
  listDepositsArgsSchema,
  prepareCompleteDepositArgsSchema,
  prepareStartDepositArgsSchema,
  startDepositArgsSchema,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import { DepositStateConflict } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the deposit service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after its chain and row reads.
 */
export class DepositServiceAdaptor {
  private readonly depositService: DepositService
  private readonly logger: Logger

  constructor(depositService: DepositService, logger: Logger) {
    this.depositService = depositService
    this.logger = logger
  }

  async prepareStartDeposit(
    callerSecret: string,
    args: unknown,
  ): Promise<DepositStartInputsResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'prepareStartDeposit', caller: caller.name })
    const parsed = prepareStartDepositArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, inputs: await this.depositService.prepareStartDeposit(caller, parsed.data) }
  }

  async startDeposit(callerSecret: string, args: unknown): Promise<DepositResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'startDeposit', caller: caller.name })
    const parsed = startDepositArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<DepositResult>(async () => ({
      ok: true,
      deposit: await this.depositService.startDeposit(caller, parsed.data),
    }))
  }

  async prepareCompleteDeposit(
    callerSecret: string,
    args: unknown,
  ): Promise<DepositCompleteInputsResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'prepareCompleteDeposit', caller: caller.name })
    const parsed = prepareCompleteDepositArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<DepositCompleteInputsResult>(async () => ({
      ok: true,
      inputs: await this.depositService.prepareCompleteDeposit(caller, parsed.data),
    }))
  }

  async completeDeposit(callerSecret: string, args: unknown): Promise<DepositResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'completeDeposit', caller: caller.name })
    const parsed = completeDepositArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<DepositResult>(async () => ({
      ok: true,
      deposit: await this.depositService.completeDeposit(caller, parsed.data),
    }))
  }

  async getDeposit(callerSecret: string, args: unknown): Promise<DepositResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getDeposit', caller: caller.name })
    const parsed = getDepositArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const deposit = await this.depositService.getDeposit(caller, parsed.data)
    if (deposit === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, deposit }
  }

  async listDeposits(callerSecret: string, args: unknown): Promise<DepositListResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'listDeposits', caller: caller.name })
    const parsed = listDepositsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, deposits: await this.depositService.listDeposits(caller, parsed.data) }
  }
}

export type DepositResult = { readonly ok: true; readonly deposit: Deposit } | Refused

export type DepositListResult = { readonly ok: true; readonly deposits: Deposit[] } | Refused

export type DepositStartInputsResult =
  | { readonly ok: true; readonly inputs: DepositStartInputs }
  | Refused

export type DepositCompleteInputsResult =
  | { readonly ok: true; readonly inputs: DepositCompleteInputs }
  | Refused

/** A refusal the caller recovers from by a fixed step: a nonce conflict by preparing and building the call again. */
export type DepositRefusalReason = 'nonceConflict'

type Refused = {
  readonly ok: false
  readonly error: string
  readonly reason?: DepositRefusalReason
}

/** A state conflict, a recipient mismatch, a moved nonce and bound bytes that are not the expected vault call are refusals the caller can act on. */
async function outcomeOf<Result>(action: () => Promise<Result>): Promise<Result | Refused> {
  try {
    return await action()
  } catch (error: unknown) {
    if (error instanceof DepositNonceConflict) {
      return { ok: false, error: error.message, reason: 'nonceConflict' }
    }
    if (
      error instanceof DepositStateConflict ||
      error instanceof DepositRecipientMismatch ||
      error instanceof DepositCallMismatch
    ) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}
