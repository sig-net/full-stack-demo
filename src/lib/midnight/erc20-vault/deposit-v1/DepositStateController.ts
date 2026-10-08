import { z } from 'zod'

import {
  type Deposit,
  depositNameSchema,
  depositSchema,
} from '@/lib/midnight/erc20-vault/deposit-v1/Deposit'

export interface DepositStateController {
  startDeposit(args: StartDepositArgs): Promise<Deposit>
  resolveDepositState(args: ResolveDepositStateArgs): Promise<Deposit>
}

export const startDepositArgsSchema = z.object({
  deposit: depositSchema,
})

export type StartDepositArgs = z.infer<typeof startDepositArgsSchema>

export const resolveDepositStateArgsSchema = z.object({
  name: depositNameSchema,
})

export type ResolveDepositStateArgs = z.infer<typeof resolveDepositStateArgsSchema>
