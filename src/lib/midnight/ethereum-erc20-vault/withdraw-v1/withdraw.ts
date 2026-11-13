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

/** The collection segment of a withdrawal's resource name. */
export const WITHDRAW_COLLECTION = 'ethereum-erc20-vault-withdraws'

/** `callers/{caller}/ethereum-erc20-vault-withdraws/{withdraw}`, where the withdraw is a UUID. */
export const withdrawNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${WITHDRAW_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${WITHDRAW_COLLECTION}/{uuid}`,
  )

/** The withdrawal's lifecycle is the caller operation's, under its own names. */
export const WITHDRAW_STATES = CALLER_OPERATION_STATES

export const withdrawStateSchema = callerOperationStateSchema

export type WithdrawState = CallerOperationState

export const WITHDRAW_TERMINAL_STATES = CALLER_OPERATION_TERMINAL_STATES

export const isTerminalWithdrawState = isTerminalCallerOperationState

export const WITHDRAW_PENDING_STATES = CALLER_OPERATION_PENDING_STATES

export const WITHDRAW_FAILURES = CALLER_OPERATION_FAILURES

export const withdrawFailureSchema = callerOperationFailureSchema

export type WithdrawFailure = CallerOperationFailure

/** What the complete circuit did: closed after a transfer that paid the destination, or re-minted the surrendered amount after one that did not. */
export const WITHDRAW_OUTCOMES = ['sent', 'refunded'] as const

export const withdrawOutcomeSchema = z.enum(WITHDRAW_OUTCOMES)

export type WithdrawOutcome = z.infer<typeof withdrawOutcomeSchema>

/**
 * The withdraw resource: an ERC20 transfer from the vault account to a destination on Ethereum,
 * paid from a vault coin of the token worth exactly `amount` that the start circuit burns. The
 * caller supplies the request, the server assigns the slot before the browser builds the
 * `startWithdraw` circuit call and derives the vault account when it commits it. The
 * transactions and the vault request behind its steps name it as their parent.
 */
export const withdrawSchema = z.object({
  name: withdrawNameSchema,
  /** The ERC20 sent: its vault coin is surrendered at start. */
  erc20Address: evmAddressSchema,
  /** The amount sent, in the token's base units: the coin surrendered, re-minted when the transfer fails. */
  amount: amountSchema,
  /** The Ethereum account the transfer pays. */
  destEvmAddress: evmAddressSchema,
  state: withdrawStateSchema,
  /** The circuit's `inIndex`: the request's slot in the vault's buffers, chosen at random. */
  inIndex: uint64Schema,
  /** The commitment of the vault secret the start call was built with, the one secret the contract lets complete the request. */
  userCommitment: hex32BytesSchema,
  /** The EVM account the MPC signs the transfer from: the vault's own, which holds the token. */
  vaultAccount: evmAddressSchema,
  /** Set with `Completed`. */
  outcome: withdrawOutcomeSchema.nullable(),
  /** Set with `Failed`. */
  failure: withdrawFailureSchema.nullable(),
  /** The child's message behind a failure, where there was one. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type Withdraw = z.infer<typeof withdrawSchema>

/** What the caller supplies to start a withdrawal, the circuit's `WithdrawRequest`. */
export const withdrawRequestSchema = withdrawSchema.pick({
  erc20Address: true,
  amount: true,
  destEvmAddress: true,
})

export type WithdrawRequest = z.infer<typeof withdrawRequestSchema>

/** What the server assigns to a start call, afresh on every `prepareStartWithdraw`: the slot. */
export type WithdrawStartInputs = Pick<Withdraw, 'inIndex'>

/** What the complete circuit takes from the withdrawal's attested request. */
export type WithdrawCompleteInputs = CompletionInputs

export function withdrawName(parent: string, id: string): string {
  return `${parent}/${WITHDRAW_COLLECTION}/${id}`
}
