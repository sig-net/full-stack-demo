import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Deposit,
  depositNameSchema,
  depositSchema,
} from '@/lib/midnight/erc20-vault/deposit-v1/deposit'

/** The deposit API's methods, independent of the transport that exposes them. */
export interface DepositService {
  startDeposit(caller: Caller, args: StartDepositArgs): Promise<Deposit>

  getDeposit(caller: Caller, args: GetDepositArgs): Promise<Deposit | undefined>
}

export const startDepositArgsSchema = z.object({
  depositArgs: depositSchema.omit({ name: true }),
})
export type StartDepositArgs = z.infer<typeof startDepositArgsSchema>

export const getDepositArgsSchema = z.object({
  name: depositNameSchema,
})
export type GetDepositArgs = z.infer<typeof getDepositArgsSchema>
