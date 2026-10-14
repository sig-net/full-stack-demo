import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import { walletPublicKeysSchema } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import {
  type Supply,
  supplyNameSchema,
  supplyRequestSchema,
  type SupplyTarget,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'

/**
 * The supply API's methods, independent of the transport that exposes them. The two user
 * actions build the caller's circuit call, which reads the indexer and runs the circuit, and
 * then open the one transaction that stores the supply's step and the call.
 */
export interface SupplyService {
  /** The pinned pair from the vault ledger and the wrapper's allowance from the chain. */
  getSupplyTarget(caller: Caller, args: GetSupplyTargetArgs): Promise<SupplyTarget>
  /** Reads the pair, assigns the server-chosen fields, builds the start call and stores the supply in `AwaitingStartTransaction`. */
  startSupply(caller: Caller, args: StartSupplyArgs): Promise<Supply>
  /** Builds the complete call for the supply's attested request and moves it to `AwaitingCompleteTransaction`. */
  completeSupply(caller: Caller, args: CompleteSupplyArgs): Promise<Supply>
  getSupply(caller: Caller, args: GetSupplyArgs): Promise<Supply | undefined>
  /** The caller's supplies, newest first. */
  listSupplies(caller: Caller, args: ListSuppliesArgs): Promise<Supply[]>
}

export const getSupplyTargetArgsSchema = z.object({})
export type GetSupplyTargetArgs = z.infer<typeof getSupplyTargetArgsSchema>

export const startSupplyArgsSchema = z.object({
  supplyRequest: supplyRequestSchema,
  wallet: walletPublicKeysSchema,
})
export type StartSupplyArgs = z.infer<typeof startSupplyArgsSchema>

export const completeSupplyArgsSchema = z.object({
  name: supplyNameSchema,
  wallet: walletPublicKeysSchema,
})
export type CompleteSupplyArgs = z.infer<typeof completeSupplyArgsSchema>

export const getSupplyArgsSchema = z.object({
  name: supplyNameSchema,
})
export type GetSupplyArgs = z.infer<typeof getSupplyArgsSchema>

export const listSuppliesArgsSchema = z.object({})
export type ListSuppliesArgs = z.infer<typeof listSuppliesArgsSchema>
