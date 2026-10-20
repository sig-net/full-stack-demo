import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Swap,
  type SwapCompleteInputs,
  swapNameSchema,
  swapRequestSchema,
  type SwapStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import {
  SWAP_SLIPPAGE_BPS,
  type SwapQuote,
  swapSlippageBpsSchema,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-quote'
import { amountSchema, evmAddressSchema, hexBytesSchema, uint64Schema } from '@/lib/value-schemas'

/**
 * The swap API's methods, independent of the transport that exposes them. The browser builds,
 * proves and binds the caller's two circuit calls from the inputs the prepare methods return,
 * and the two user actions commit the bound bytes. The server checks that the bound bytes are
 * exactly one call to the vault's expected circuit under that circuit's coin policy, since the
 * relayer pays their fee, and does not inspect the inputs the call carries.
 */
export interface SwapService {
  /** The best live price for the pair over every pool tier, or undefined when no pool prices it. */
  quoteSwap(caller: Caller, args: QuoteSwapArgs): Promise<SwapQuote | undefined>
  /** The start circuit's server-decided slot, assigned afresh on every call, with nothing written. */
  prepareStartSwap(caller: Caller, args: PrepareStartSwapArgs): Promise<SwapStartInputs>
  /** Stores the swap in `AwaitingStartTransaction` under the vault account with the bound start call under it. */
  startSwap(caller: Caller, args: StartSwapArgs): Promise<Swap>
  /** The attested request's fields the complete circuit takes, after the state check `completeSwap` repeats. */
  prepareCompleteSwap(caller: Caller, args: PrepareCompleteSwapArgs): Promise<SwapCompleteInputs>
  /** Moves the swap to `AwaitingCompleteTransaction` with the bound complete call under it. */
  completeSwap(caller: Caller, args: CompleteSwapArgs): Promise<Swap>
  getSwap(caller: Caller, args: GetSwapArgs): Promise<Swap | undefined>
  /** The caller's swaps, newest first. */
  listSwaps(caller: Caller, args: ListSwapsArgs): Promise<Swap[]>
}

export const quoteSwapArgsSchema = z.object({
  erc20AddressIn: evmAddressSchema,
  erc20AddressOut: evmAddressSchema,
  amountIn: amountSchema,
  slippageBps: swapSlippageBpsSchema.default(SWAP_SLIPPAGE_BPS),
})
export type QuoteSwapArgs = z.infer<typeof quoteSwapArgsSchema>

/** The browser's wallet keys go into the call the browser builds and nowhere else, so no method takes them. */
export const prepareStartSwapArgsSchema = z.object({
  swapRequest: swapRequestSchema,
})
export type PrepareStartSwapArgs = z.infer<typeof prepareStartSwapArgsSchema>

/** The slot the browser baked into the call travels with it, and the bound bytes are hex in the ledger's serialisation. */
export const startSwapArgsSchema = prepareStartSwapArgsSchema.extend({
  inIndex: uint64Schema,
  boundTx: hexBytesSchema,
})
export type StartSwapArgs = z.infer<typeof startSwapArgsSchema>

export const prepareCompleteSwapArgsSchema = z.object({
  name: swapNameSchema,
})
export type PrepareCompleteSwapArgs = z.infer<typeof prepareCompleteSwapArgsSchema>

export const completeSwapArgsSchema = prepareCompleteSwapArgsSchema.extend({
  boundTx: hexBytesSchema,
})
export type CompleteSwapArgs = z.infer<typeof completeSwapArgsSchema>

export const getSwapArgsSchema = z.object({
  name: swapNameSchema,
})
export type GetSwapArgs = z.infer<typeof getSwapArgsSchema>

export const listSwapsArgsSchema = z.object({})
export type ListSwapsArgs = z.infer<typeof listSwapsArgsSchema>
