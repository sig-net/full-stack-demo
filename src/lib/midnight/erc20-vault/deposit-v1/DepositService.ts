import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Deposit,
  depositNameSchema,
  depositSchema,
} from '@/lib/midnight/erc20-vault/deposit-v1/Deposit'

/** The deposit API's methods, independent of the transport that exposes them. */
export interface DepositService {
  /** Assigns a name under the caller and stores the deposit. */
  createDeposit(caller: Caller, args: CreateDepositArgs): Promise<Deposit>
  /** The caller's deposit with that name. A deposit under another caller reads as absent. */
  getDeposit(caller: Caller, args: GetDepositArgs): Promise<Deposit | undefined>
}

/** The fields a client supplies to `createDeposit`. */
export const createDepositArgsSchema = depositSchema.omit({ name: true })

export type CreateDepositArgs = z.infer<typeof createDepositArgsSchema>

export const getDepositArgsSchema = z.object({
  name: depositNameSchema,
})

export type GetDepositArgs = z.infer<typeof getDepositArgsSchema>
