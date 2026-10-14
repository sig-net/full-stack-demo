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
import {
  amountSchema,
  evmAddressSchema,
  HEX_32_BYTES,
  uint64Schema,
  UUID,
} from '@/lib/value-schemas'

/** The collection segment of a redeem's resource name. */
export const REDEEM_COLLECTION = 'ethereum-erc20-vault-redeems'

/** `callers/{caller}/ethereum-erc20-vault-redeems/{redeem}`, where the redeem is a UUID. */
export const redeemNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${REDEEM_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${REDEEM_COLLECTION}/{uuid}`,
  )

/** The redeem's lifecycle is the caller operation's, under its own names. */
export const REDEEM_STATES = CALLER_OPERATION_STATES

export const redeemStateSchema = callerOperationStateSchema

export type RedeemState = CallerOperationState

export const REDEEM_TERMINAL_STATES = CALLER_OPERATION_TERMINAL_STATES

export const isTerminalRedeemState = isTerminalCallerOperationState

export const REDEEM_PENDING_STATES = CALLER_OPERATION_PENDING_STATES

export const REDEEM_FAILURES = CALLER_OPERATION_FAILURES

export const redeemFailureSchema = callerOperationFailureSchema

export type RedeemFailure = CallerOperationFailure

/** What the complete circuit did: minted the underlying the wrapper paid out after a redeem that executed, or re-minted the surrendered shares after one that did not. */
export const REDEEM_OUTCOMES = ['redeemed', 'refunded'] as const

export const redeemOutcomeSchema = z.enum(REDEEM_OUTCOMES)

export type RedeemOutcome = z.infer<typeof redeemOutcomeSchema>

/**
 * The redeem resource: a redemption of shares of Aave's static wrapper from the vault account,
 * paid from a vault coin of the wrapper's token worth exactly `shares` that the start circuit
 * burns. The caller supplies the shares, the server reads the pinned pair from the vault ledger
 * and assigns everything else before the `startRedeem` circuit is built. The transactions and
 * the vault request behind its steps name it as their parent.
 */
export const redeemSchema = z.object({
  name: redeemNameSchema,
  /** The wrapper, pinned by the vault: its vault coin is surrendered at start. */
  stataErc20Address: evmAddressSchema,
  /** The wrapper's underlying ERC20, pinned by the vault: the completion mints the assets the wrapper paid out as this ERC20's vault coin. */
  underlyingErc20Address: evmAddressSchema,
  /** The shares redeemed, in the wrapper's base units: the coin surrendered, re-minted when the redeem fails. */
  shares: amountSchema,
  state: redeemStateSchema,
  /** The circuit's `inIndex`: the request's slot in the vault's buffers, chosen at random. */
  inIndex: uint64Schema,
  /** The EVM account the MPC signs the redeem from: the vault's own, which holds the shares and receives the underlying. */
  vaultAccount: evmAddressSchema,
  /** Set with `Completed`. */
  outcome: redeemOutcomeSchema.nullable(),
  /** Set with `Failed`. */
  failure: redeemFailureSchema.nullable(),
  /** The child's message behind a failure, where there was one. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type Redeem = z.infer<typeof redeemSchema>

/** What the caller redeems to start a redeem, the circuit's `RedeemRequest`. */
export const redeemRequestSchema = redeemSchema.pick({ shares: true })

export type RedeemRequest = z.infer<typeof redeemRequestSchema>

export function redeemName(parent: string, id: string): string {
  return `${parent}/${REDEEM_COLLECTION}/${id}`
}
