import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Supply,
  type SupplyCompleteInputs,
  supplyNameSchema,
  supplyRequestSchema,
  type SupplyStartInputs,
  type SupplyTarget,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import { hexBytesSchema, uint64Schema } from '@/lib/value-schemas'

/**
 * The supply API's methods, independent of the transport that exposes them. The browser builds,
 * proves and finalises the caller's two circuit calls from the inputs the prepare methods return,
 * and the two user actions commit the finalised bytes. The server inspects neither the bytes nor
 * the inputs the call carries: the operation follows its child transaction's outcome, and the
 * resolver reads the vault ledger only when a child failed.
 */
export interface SupplyService {
  /** The pinned pair from the vault ledger and the wrapper's allowance from the chain. */
  getSupplyTarget(caller: Caller, args: GetSupplyTargetArgs): Promise<SupplyTarget>
  /** The start circuit's server-decided slot, assigned afresh on every call, and the pinned underlying, with nothing written. */
  prepareStartSupply(caller: Caller, args: PrepareStartSupplyArgs): Promise<SupplyStartInputs>
  /** Stores the supply in `AwaitingStartTransaction` over the pinned pair and the vault account with the finalised start call under it. */
  startSupply(caller: Caller, args: StartSupplyArgs): Promise<Supply>
  /** The attested request's fields the complete circuit takes, after the state check `completeSupply` repeats. */
  prepareCompleteSupply(
    caller: Caller,
    args: PrepareCompleteSupplyArgs,
  ): Promise<SupplyCompleteInputs>
  /** Moves the supply to `AwaitingCompleteTransaction` with the finalised complete call under it. */
  completeSupply(caller: Caller, args: CompleteSupplyArgs): Promise<Supply>
  getSupply(caller: Caller, args: GetSupplyArgs): Promise<Supply | undefined>
  /** The caller's supplies, newest first. */
  listSupplies(caller: Caller, args: ListSuppliesArgs): Promise<Supply[]>
}

export const getSupplyTargetArgsSchema = z.object({})
export type GetSupplyTargetArgs = z.infer<typeof getSupplyTargetArgsSchema>

/** The browser's wallet keys go into the call the browser builds and nowhere else, so no method takes them. */
export const prepareStartSupplyArgsSchema = z.object({
  supplyRequest: supplyRequestSchema,
})
export type PrepareStartSupplyArgs = z.infer<typeof prepareStartSupplyArgsSchema>

/** The slot the browser baked into the call travels with it, and the finalised bytes are hex in the ledger's serialisation. */
export const startSupplyArgsSchema = prepareStartSupplyArgsSchema.extend({
  inIndex: uint64Schema,
  finalizedTx: hexBytesSchema,
})
export type StartSupplyArgs = z.infer<typeof startSupplyArgsSchema>

export const prepareCompleteSupplyArgsSchema = z.object({
  name: supplyNameSchema,
})
export type PrepareCompleteSupplyArgs = z.infer<typeof prepareCompleteSupplyArgsSchema>

export const completeSupplyArgsSchema = prepareCompleteSupplyArgsSchema.extend({
  finalizedTx: hexBytesSchema,
})
export type CompleteSupplyArgs = z.infer<typeof completeSupplyArgsSchema>

export const getSupplyArgsSchema = z.object({
  name: supplyNameSchema,
})
export type GetSupplyArgs = z.infer<typeof getSupplyArgsSchema>

export const listSuppliesArgsSchema = z.object({})
export type ListSuppliesArgs = z.infer<typeof listSuppliesArgsSchema>
