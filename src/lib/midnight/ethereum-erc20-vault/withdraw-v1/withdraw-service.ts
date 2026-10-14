import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import { walletPublicKeysSchema } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import {
  type Withdraw,
  withdrawNameSchema,
  withdrawRequestSchema,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'

/**
 * The withdraw API's methods, independent of the transport that exposes them. The two user
 * actions build the caller's circuit call, which reads the indexer and runs the circuit, and
 * then open the one transaction that stores the withdrawal's step and the call.
 */
export interface WithdrawService {
  /** Assigns the server-chosen fields, builds the start call and stores the withdrawal in `AwaitingStartTransaction`. */
  startWithdraw(caller: Caller, args: StartWithdrawArgs): Promise<Withdraw>
  /** Builds the complete call for the withdrawal's attested request and moves it to `AwaitingCompleteTransaction`. */
  completeWithdraw(caller: Caller, args: CompleteWithdrawArgs): Promise<Withdraw>
  getWithdraw(caller: Caller, args: GetWithdrawArgs): Promise<Withdraw | undefined>
  /** The caller's withdrawals, newest first. */
  listWithdraws(caller: Caller, args: ListWithdrawsArgs): Promise<Withdraw[]>
}

export const startWithdrawArgsSchema = z.object({
  withdrawRequest: withdrawRequestSchema,
  wallet: walletPublicKeysSchema,
})
export type StartWithdrawArgs = z.infer<typeof startWithdrawArgsSchema>

export const completeWithdrawArgsSchema = z.object({
  name: withdrawNameSchema,
  wallet: walletPublicKeysSchema,
})
export type CompleteWithdrawArgs = z.infer<typeof completeWithdrawArgsSchema>

export const getWithdrawArgsSchema = z.object({
  name: withdrawNameSchema,
})
export type GetWithdrawArgs = z.infer<typeof getWithdrawArgsSchema>

export const listWithdrawsArgsSchema = z.object({})
export type ListWithdrawsArgs = z.infer<typeof listWithdrawsArgsSchema>
