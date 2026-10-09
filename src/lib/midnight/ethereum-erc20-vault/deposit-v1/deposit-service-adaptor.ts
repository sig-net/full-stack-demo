import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  completeDepositArgsSchema,
  type DepositService,
  getDepositArgsSchema,
  listDepositsArgsSchema,
  startDepositArgsSchema,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import { DepositStateConflict } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'

/**
 * Adapts the deposit service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after the circuit build.
 */
export class DepositServiceAdaptor {
  private readonly depositService: DepositService

  constructor(depositService: DepositService) {
    this.depositService = depositService
  }

  async startDeposit(callerSecret: string, args: unknown): Promise<DepositResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = startDepositArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.depositService.startDeposit(caller, parsed.data))
  }

  async completeDeposit(callerSecret: string, args: unknown): Promise<DepositResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = completeDepositArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.depositService.completeDeposit(caller, parsed.data))
  }

  async getDeposit(callerSecret: string, args: unknown): Promise<DepositResult> {
    const caller = resolveCaller(callerSecret)
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
    const parsed = listDepositsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, deposits: await this.depositService.listDeposits(caller, parsed.data) }
  }
}

export type DepositResult =
  | { readonly ok: true; readonly deposit: Deposit }
  | { readonly ok: false; readonly error: string }

export type DepositListResult =
  | { readonly ok: true; readonly deposits: Deposit[] }
  | { readonly ok: false; readonly error: string }

/** A state conflict and a contract assert firing at build time are the vault refusing the call, which the caller can act on. */
async function outcomeOf(action: () => Promise<Deposit>): Promise<DepositResult> {
  try {
    return { ok: true, deposit: await action() }
  } catch (error: unknown) {
    if (error instanceof DepositStateConflict || isCircuitRefusal(error)) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}

/** The compact runtime prefixes the contract's assert message, and the build rethrows it as a plain `Error`. */
function isCircuitRefusal(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith('failed assert: ')
}
