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
import { userCommitmentSchema } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'
import { amountSchema, evmAddressSchema, hexBytesSchema, uint64Schema } from '@/lib/value-schemas'

/**
 * The swap API's methods, independent of the transport that exposes them. The browser builds,
 * proves and finalises the caller's two circuit calls from the inputs the prepare methods return,
 * and the two user actions commit the finalised bytes. The server inspects neither the bytes nor
 * the inputs the call carries: the operation follows its child transaction's outcome, and the
 * resolver reads the vault ledger only when a child failed.
 */
export interface SwapService {
  /** The best live price for the pair over every pool tier, or undefined when no pool prices it. */
  quoteSwap(caller: Caller, args: QuoteSwapArgs): Promise<SwapQuote | undefined>
  /** The start circuit's server-decided slot, assigned afresh on every call, with nothing written. */
  prepareStartSwap(caller: Caller, args: PrepareStartSwapArgs): Promise<SwapStartInputs>
  /** Stores the swap in `AwaitingStartTransaction` under the vault account with the finalised start call under it. */
  startSwap(caller: Caller, args: StartSwapArgs): Promise<Swap>
  /** The attested request's fields the complete circuit takes, after the state check `completeSwap` repeats. */
  prepareCompleteSwap(caller: Caller, args: PrepareCompleteSwapArgs): Promise<SwapCompleteInputs>
  /** Moves the swap to `AwaitingCompleteTransaction` with the finalised complete call under it. */
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

/** The slot the browser baked into the call and the commitment of the secret it built it with travel with it, and the finalised bytes are hex in the ledger's serialisation. */
export const startSwapArgsSchema = prepareStartSwapArgsSchema.extend({
  userCommitment: userCommitmentSchema,
  inIndex: uint64Schema,
  finalizedTx: hexBytesSchema,
})
export type StartSwapArgs = z.infer<typeof startSwapArgsSchema>

export const prepareCompleteSwapArgsSchema = z.object({
  name: swapNameSchema,
})
export type PrepareCompleteSwapArgs = z.infer<typeof prepareCompleteSwapArgsSchema>

export const completeSwapArgsSchema = prepareCompleteSwapArgsSchema.extend({
  finalizedTx: hexBytesSchema,
})
export type CompleteSwapArgs = z.infer<typeof completeSwapArgsSchema>

export const getSwapArgsSchema = z.object({
  name: swapNameSchema,
})
export type GetSwapArgs = z.infer<typeof getSwapArgsSchema>

export const listSwapsArgsSchema = z.object({})
export type ListSwapsArgs = z.infer<typeof listSwapsArgsSchema>
