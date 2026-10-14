import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import { walletPublicKeysSchema } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import {
  type Swap,
  swapNameSchema,
  swapRequestSchema,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { SwapQuote } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-quote'
import { amountSchema, evmAddressSchema } from '@/lib/value-schemas'

/**
 * The swap API's methods, independent of the transport that exposes them. The two user actions
 * build the caller's circuit call, which reads the indexer and runs the circuit, and then open
 * the one transaction that stores the swap's step and the call.
 */
export interface SwapService {
  /** The best live price for the pair over every pool tier, or undefined when no pool prices it. */
  quoteSwap(caller: Caller, args: QuoteSwapArgs): Promise<SwapQuote | undefined>
  /** Assigns the server-chosen fields, builds the start call and stores the swap in `AwaitingStartTransaction`. */
  startSwap(caller: Caller, args: StartSwapArgs): Promise<Swap>
  /** Builds the complete call for the swap's attested request and moves it to `AwaitingCompleteTransaction`. */
  completeSwap(caller: Caller, args: CompleteSwapArgs): Promise<Swap>
  getSwap(caller: Caller, args: GetSwapArgs): Promise<Swap | undefined>
  /** The caller's swaps, newest first. */
  listSwaps(caller: Caller, args: ListSwapsArgs): Promise<Swap[]>
}

export const quoteSwapArgsSchema = z.object({
  erc20AddressIn: evmAddressSchema,
  erc20AddressOut: evmAddressSchema,
  amountIn: amountSchema,
})
export type QuoteSwapArgs = z.infer<typeof quoteSwapArgsSchema>

export const startSwapArgsSchema = z.object({
  swapRequest: swapRequestSchema,
  wallet: walletPublicKeysSchema,
})
export type StartSwapArgs = z.infer<typeof startSwapArgsSchema>

export const completeSwapArgsSchema = z.object({
  name: swapNameSchema,
  wallet: walletPublicKeysSchema,
})
export type CompleteSwapArgs = z.infer<typeof completeSwapArgsSchema>

export const getSwapArgsSchema = z.object({
  name: swapNameSchema,
})
export type GetSwapArgs = z.infer<typeof getSwapArgsSchema>

export const listSwapsArgsSchema = z.object({})
export type ListSwapsArgs = z.infer<typeof listSwapsArgsSchema>
