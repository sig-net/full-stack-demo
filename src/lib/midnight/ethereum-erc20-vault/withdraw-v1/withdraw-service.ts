import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Withdraw,
  type WithdrawCompleteInputs,
  withdrawNameSchema,
  withdrawRequestSchema,
  type WithdrawStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import { userCommitmentSchema } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'
import { hexBytesSchema, uint64Schema } from '@/lib/value-schemas'

/**
 * The withdraw API's methods, independent of the transport that exposes them. The browser
 * builds, proves and finalises the caller's two circuit calls from the inputs the prepare
 * methods return, and the two user actions commit the finalised bytes. The server inspects neither the bytes nor
 * the inputs the call carries: the operation follows its child transaction's outcome, and the
 * resolver reads the vault ledger only when a child failed.
 */
export interface WithdrawService {
  /** The start circuit's server-decided slot, assigned afresh on every call, with nothing written. */
  prepareStartWithdraw(caller: Caller, args: PrepareStartWithdrawArgs): Promise<WithdrawStartInputs>
  /** Stores the withdrawal in `AwaitingStartTransaction` under the vault account with the finalised start call under it. */
  startWithdraw(caller: Caller, args: StartWithdrawArgs): Promise<Withdraw>
  /** The attested request's fields the complete circuit takes, after the state check `completeWithdraw` repeats. */
  prepareCompleteWithdraw(
    caller: Caller,
    args: PrepareCompleteWithdrawArgs,
  ): Promise<WithdrawCompleteInputs>
  /** Moves the withdrawal to `AwaitingCompleteTransaction` with the finalised complete call under it. */
  completeWithdraw(caller: Caller, args: CompleteWithdrawArgs): Promise<Withdraw>
  getWithdraw(caller: Caller, args: GetWithdrawArgs): Promise<Withdraw | undefined>
  /** The caller's withdrawals, newest first. */
  listWithdraws(caller: Caller, args: ListWithdrawsArgs): Promise<Withdraw[]>
}

/** The browser's wallet keys go into the call the browser builds and nowhere else, so no method takes them. */
export const prepareStartWithdrawArgsSchema = z.object({
  withdrawRequest: withdrawRequestSchema,
})
export type PrepareStartWithdrawArgs = z.infer<typeof prepareStartWithdrawArgsSchema>

/** The slot the browser baked into the call and the commitment of the secret it built it with travel with it, and the finalised bytes are hex in the ledger's serialisation. */
export const startWithdrawArgsSchema = prepareStartWithdrawArgsSchema.extend({
  userCommitment: userCommitmentSchema,
  inIndex: uint64Schema,
  finalizedTx: hexBytesSchema,
})
export type StartWithdrawArgs = z.infer<typeof startWithdrawArgsSchema>

export const prepareCompleteWithdrawArgsSchema = z.object({
  name: withdrawNameSchema,
})
export type PrepareCompleteWithdrawArgs = z.infer<typeof prepareCompleteWithdrawArgsSchema>

export const completeWithdrawArgsSchema = prepareCompleteWithdrawArgsSchema.extend({
  finalizedTx: hexBytesSchema,
})
export type CompleteWithdrawArgs = z.infer<typeof completeWithdrawArgsSchema>

export const getWithdrawArgsSchema = z.object({
  name: withdrawNameSchema,
})
export type GetWithdrawArgs = z.infer<typeof getWithdrawArgsSchema>

export const listWithdrawsArgsSchema = z.object({})
export type ListWithdrawsArgs = z.infer<typeof listWithdrawsArgsSchema>
