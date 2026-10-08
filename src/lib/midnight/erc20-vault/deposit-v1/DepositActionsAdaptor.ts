'use server'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { Deposit } from '@/lib/midnight/erc20-vault/deposit-v1/Deposit'
import {
  type StartDepositArgs,
  startDepositArgsSchema,
  type GetDepositArgs,
  getDepositArgsSchema,
} from '@/lib/midnight/erc20-vault/deposit-v1/DepositService'
import { getDepositService } from '@/lib/midnight/erc20-vault/deposit-v1/DepositServiceImpl'

export type DepositResult =
  | { readonly ok: true; readonly deposit: Deposit }
  | { readonly ok: false; readonly error: string }

/** CreateDeposit as a server action: the caller secret stands in for the caller. */
export async function startDeposit(
  callerSecret: string,
  args: StartDepositArgs,
): Promise<DepositResult> {
  const caller = resolveCaller(callerSecret)
  // The argument arrives from the browser, so its static type is not a guarantee.
  const parsed = startDepositArgsSchema.safeParse(args)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }
  const service = await getDepositService()

  return { ok: true, deposit: await service.startDeposit(caller, parsed.data) }
}

/** GetDeposit as a server action: the caller secret stands in for the caller. */
export async function getDeposit(
  callerSecret: string,
  args: GetDepositArgs,
): Promise<DepositResult> {
  const caller = resolveCaller(callerSecret)
  const parsed = getDepositArgsSchema.safeParse(args)
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) }
  }
  const service = await getDepositService()
  const deposit = await service.getDeposit(caller, parsed.data)
  if (deposit === undefined) {
    return { ok: false, error: `${parsed.data.name} was not found.` }
  }
  return { ok: true, deposit }
}
