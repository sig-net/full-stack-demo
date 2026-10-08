import { z } from 'zod'

import {
  type Deposit,
  depositNameSchema,
  depositSchema,
} from '@/lib/midnight/erc20-vault/deposit-v1/Deposit'
import { callerSecretSchema } from '@/lib/caller/caller'

export interface DepositStateController {
  startDeposit(args: StartDepositArgs): Promise<Deposit>

  resolveDepositState(args: ResolveDepositStateArgs): Promise<Deposit>
}

export const requestStartDepositArgsSchema = z.object({
  callerSecret: callerSecretSchema,
  deposit: depositSchema,
})
export type StartDepositArgs = z.infer<typeof requestStartDepositArgsSchema>

export const resolveDepositStateArgsSchema = z.object({
  name: depositNameSchema,
})
export type ResolveDepositStateArgs = z.infer<typeof resolveDepositStateArgsSchema>
