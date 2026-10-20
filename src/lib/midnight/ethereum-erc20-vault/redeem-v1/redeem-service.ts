import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Redeem,
  type RedeemCompleteInputs,
  redeemNameSchema,
  redeemRequestSchema,
  type RedeemStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import { hexBytesSchema, uint64Schema } from '@/lib/value-schemas'

/**
 * The redeem API's methods, independent of the transport that exposes them. The browser builds,
 * proves and binds the caller's two circuit calls from the inputs the prepare methods return,
 * and the two user actions commit the bound bytes. The server checks that the bound bytes are
 * exactly one call to the vault's expected circuit under that circuit's coin policy, since the
 * relayer pays their fee, and does not inspect the inputs the call carries.
 */
export interface RedeemService {
  /** The start circuit's server-decided slot, assigned afresh on every call, and the pinned wrapper, with nothing written. */
  prepareStartRedeem(caller: Caller, args: PrepareStartRedeemArgs): Promise<RedeemStartInputs>
  /** Reads the pinned pair and stores the redeem in `AwaitingStartTransaction` under the vault account with the bound start call under it. */
  startRedeem(caller: Caller, args: StartRedeemArgs): Promise<Redeem>
  /** The attested request's fields the complete circuit takes, after the state check `completeRedeem` repeats. */
  prepareCompleteRedeem(
    caller: Caller,
    args: PrepareCompleteRedeemArgs,
  ): Promise<RedeemCompleteInputs>
  /** Moves the redeem to `AwaitingCompleteTransaction` with the bound complete call under it. */
  completeRedeem(caller: Caller, args: CompleteRedeemArgs): Promise<Redeem>
  getRedeem(caller: Caller, args: GetRedeemArgs): Promise<Redeem | undefined>
  /** The caller's redeems, newest first. */
  listRedeems(caller: Caller, args: ListRedeemsArgs): Promise<Redeem[]>
}

/** The browser's wallet keys go into the call the browser builds and nowhere else, so no method takes them. */
export const prepareStartRedeemArgsSchema = z.object({
  redeemRequest: redeemRequestSchema,
})
export type PrepareStartRedeemArgs = z.infer<typeof prepareStartRedeemArgsSchema>

/** The slot the browser baked into the call travels with it, and the bound bytes are hex in the ledger's serialisation. */
export const startRedeemArgsSchema = prepareStartRedeemArgsSchema.extend({
  inIndex: uint64Schema,
  boundTx: hexBytesSchema,
})
export type StartRedeemArgs = z.infer<typeof startRedeemArgsSchema>

export const prepareCompleteRedeemArgsSchema = z.object({
  name: redeemNameSchema,
})
export type PrepareCompleteRedeemArgs = z.infer<typeof prepareCompleteRedeemArgsSchema>

export const completeRedeemArgsSchema = prepareCompleteRedeemArgsSchema.extend({
  boundTx: hexBytesSchema,
})
export type CompleteRedeemArgs = z.infer<typeof completeRedeemArgsSchema>

export const getRedeemArgsSchema = z.object({
  name: redeemNameSchema,
})
export type GetRedeemArgs = z.infer<typeof getRedeemArgsSchema>

export const listRedeemsArgsSchema = z.object({})
export type ListRedeemsArgs = z.infer<typeof listRedeemsArgsSchema>
