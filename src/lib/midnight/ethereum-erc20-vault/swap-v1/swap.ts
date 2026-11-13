import { z } from 'zod'

import { CALLER_COLLECTION } from '@/lib/caller/caller'
import {
  CALLER_OPERATION_FAILURES,
  CALLER_OPERATION_PENDING_STATES,
  CALLER_OPERATION_STATES,
  CALLER_OPERATION_TERMINAL_STATES,
  type CallerOperationFailure,
  callerOperationFailureSchema,
  type CallerOperationState,
  callerOperationStateSchema,
  isTerminalCallerOperationState,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
import type { CompletionInputs } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import {
  amountSchema,
  evmAddressSchema,
  HEX_32_BYTES,
  uint64Schema,
  UUID,
  hex32BytesSchema,
} from '@/lib/value-schemas'

/** The collection segment of a swap's resource name. */
export const SWAP_COLLECTION = 'ethereum-erc20-vault-swaps'

/** `callers/{caller}/ethereum-erc20-vault-swaps/{swap}`, where the swap is a UUID. */
export const swapNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${SWAP_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${SWAP_COLLECTION}/{uuid}`,
  )

/** The swap's lifecycle is the caller operation's, under its own names. */
export const SWAP_STATES = CALLER_OPERATION_STATES

export const swapStateSchema = callerOperationStateSchema

export type SwapState = CallerOperationState

export const SWAP_TERMINAL_STATES = CALLER_OPERATION_TERMINAL_STATES

export const isTerminalSwapState = isTerminalCallerOperationState

export const SWAP_PENDING_STATES = CALLER_OPERATION_PENDING_STATES

export const SWAP_FAILURES = CALLER_OPERATION_FAILURES

export const swapFailureSchema = callerOperationFailureSchema

export type SwapFailure = CallerOperationFailure

/** What the complete circuit did: minted the bought amount and the change, or re-minted the surrendered amount after a trade that spent nothing. */
export const SWAP_OUTCOMES = ['swapped', 'refunded'] as const

export const swapOutcomeSchema = z.enum(SWAP_OUTCOMES)

export type SwapOutcome = z.infer<typeof swapOutcomeSchema>

/**
 * The swap resource: exact output on the vault's pinned Uniswap router, paid from a vault coin
 * of the sold token worth `amountInMaximum` that the start circuit burns. The caller supplies
 * the request, the server assigns the slot before the browser builds the `startSwap` circuit
 * call, and derives the vault account when it commits it. The transactions and the vault request
 * behind its steps name it as their parent.
 */
export const swapSchema = z.object({
  name: swapNameSchema,
  /** The ERC20 sold: its vault coin is surrendered at start. */
  erc20AddressIn: evmAddressSchema,
  /** The ERC20 bought: its vault coin is minted on success. */
  erc20AddressOut: evmAddressSchema,
  /** The Uniswap V3 pool fee tier, such as 500 or 3000. */
  fee: uint64Schema,
  /** The exact amount of `erc20AddressOut` bought, in its base units. */
  amountOut: amountSchema,
  /** The most of `erc20AddressIn` the trade may spend, in its base units: the coin surrendered, returned as change where unspent. */
  amountInMaximum: amountSchema,
  state: swapStateSchema,
  /** The circuit's `inIndex`: the request's slot in the vault's buffers, chosen at random. */
  inIndex: uint64Schema,
  /** The commitment of the vault secret the start call was built with, the one secret the contract lets complete the request. */
  userCommitment: hex32BytesSchema,
  /** The EVM account the MPC signs the trade from: the vault's own, which sells and buys. */
  vaultAccount: evmAddressSchema,
  /** Set with `Completed`. */
  outcome: swapOutcomeSchema.nullable(),
  /** Set with `Failed`. */
  failure: swapFailureSchema.nullable(),
  /** The child's message behind a failure, where there was one. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type Swap = z.infer<typeof swapSchema>

/** What the caller supplies to start a swap, the circuit's `SwapRequest`. */
export const swapRequestSchema = swapSchema.pick({
  erc20AddressIn: true,
  erc20AddressOut: true,
  fee: true,
  amountOut: true,
  amountInMaximum: true,
})

export type SwapRequest = z.infer<typeof swapRequestSchema>

/** What the server assigns to a start call, afresh on every `prepareStartSwap`: the slot. */
export type SwapStartInputs = Pick<Swap, 'inIndex'>

/** What the complete circuit takes from the swap's attested request. */
export type SwapCompleteInputs = CompletionInputs

export function swapName(parent: string, id: string): string {
  return `${parent}/${SWAP_COLLECTION}/${id}`
}
