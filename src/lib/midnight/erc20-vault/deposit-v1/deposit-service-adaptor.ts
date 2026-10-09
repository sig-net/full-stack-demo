import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { Deposit } from '@/lib/midnight/erc20-vault/deposit-v1/deposit'
import {
  type DepositService,
  getDepositArgsSchema,
  startDepositArgsSchema,
} from '@/lib/midnight/erc20-vault/deposit-v1/deposit-service'

/**
 * Adapts the deposit service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and outcomes come back as results rather than throws.
 */
export class DepositServiceAdaptor {
  private readonly depositService: DepositService
  private readonly unitOfWork: UnitOfWork

  constructor(depositService: DepositService, unitOfWork: UnitOfWork) {
    this.depositService = depositService
    this.unitOfWork = unitOfWork
  }

  async startDeposit(callerSecret: string, args: unknown): Promise<DepositResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = startDepositArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    // A write boundary: one transaction around the whole call. Reads such as getDeposit open none.
    const deposit = await this.unitOfWork.runInTransaction(() =>
      this.depositService.startDeposit(caller, parsed.data),
    )
    return { ok: true, deposit }
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
}

export type DepositResult =
  | { readonly ok: true; readonly deposit: Deposit }
  | { readonly ok: false; readonly error: string }
