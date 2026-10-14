import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import { walletPublicKeysSchema } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import {
  type Redeem,
  redeemNameSchema,
  redeemRequestSchema,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'

/**
 * The redeem API's methods, independent of the transport that exposes them. The two user
 * actions build the caller's circuit call, which reads the indexer and runs the circuit, and
 * then open the one transaction that stores the redeem's step and the call.
 */
export interface RedeemService {
  /** Reads the pair, assigns the server-chosen fields, builds the start call and stores the redeem in `AwaitingStartTransaction`. */
  startRedeem(caller: Caller, args: StartRedeemArgs): Promise<Redeem>
  /** Builds the complete call for the redeem's attested request and moves it to `AwaitingCompleteTransaction`. */
  completeRedeem(caller: Caller, args: CompleteRedeemArgs): Promise<Redeem>
  getRedeem(caller: Caller, args: GetRedeemArgs): Promise<Redeem | undefined>
  /** The caller's redeems, newest first. */
  listRedeems(caller: Caller, args: ListRedeemsArgs): Promise<Redeem[]>
}

export const startRedeemArgsSchema = z.object({
  redeemRequest: redeemRequestSchema,
  wallet: walletPublicKeysSchema,
})
export type StartRedeemArgs = z.infer<typeof startRedeemArgsSchema>

export const completeRedeemArgsSchema = z.object({
  name: redeemNameSchema,
  wallet: walletPublicKeysSchema,
})
export type CompleteRedeemArgs = z.infer<typeof completeRedeemArgsSchema>

export const getRedeemArgsSchema = z.object({
  name: redeemNameSchema,
})
export type GetRedeemArgs = z.infer<typeof getRedeemArgsSchema>

export const listRedeemsArgsSchema = z.object({})
export type ListRedeemsArgs = z.infer<typeof listRedeemsArgsSchema>
