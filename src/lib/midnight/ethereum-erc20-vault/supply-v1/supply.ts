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
} from '@/lib/value-schemas'

/** The collection segment of a supply's resource name. */
export const SUPPLY_COLLECTION = 'ethereum-erc20-vault-supplies'

/** `callers/{caller}/ethereum-erc20-vault-supplies/{supply}`, where the supply is a UUID. */
export const supplyNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${SUPPLY_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${SUPPLY_COLLECTION}/{uuid}`,
  )

/** The supply's lifecycle is the caller operation's, under its own names. */
export const SUPPLY_STATES = CALLER_OPERATION_STATES

export const supplyStateSchema = callerOperationStateSchema

export type SupplyState = CallerOperationState

export const SUPPLY_TERMINAL_STATES = CALLER_OPERATION_TERMINAL_STATES

export const isTerminalSupplyState = isTerminalCallerOperationState

export const SUPPLY_PENDING_STATES = CALLER_OPERATION_PENDING_STATES

export const SUPPLY_FAILURES = CALLER_OPERATION_FAILURES

export const supplyFailureSchema = callerOperationFailureSchema

export type SupplyFailure = CallerOperationFailure

/** What the complete circuit did: minted the wrapper's shares after a deposit that executed, or re-minted the surrendered underlying after one that did not. */
export const SUPPLY_OUTCOMES = ['supplied', 'refunded'] as const

export const supplyOutcomeSchema = z.enum(SUPPLY_OUTCOMES)

export type SupplyOutcome = z.infer<typeof supplyOutcomeSchema>

/**
 * The supply resource: a deposit of the stata underlying into Aave's static wrapper from the
 * vault account, paid from a vault coin of the underlying worth exactly `amount` that the start
 * circuit burns. The caller supplies the amount, the server reads the pinned pair from the vault
 * ledger and assigns the slot before the browser builds the `startSupply` circuit call, and reads
 * the pair and derives the vault account again when it commits it. The transactions and the
 * vault request behind its steps name it as their parent.
 */
export const supplySchema = z.object({
  name: supplyNameSchema,
  /** The wrapper's underlying ERC20, pinned by the vault: its vault coin is surrendered at start. */
  underlyingErc20Address: evmAddressSchema,
  /** The wrapper, pinned by the vault: the completion mints the shares it reported as this ERC20's vault coin. */
  stataErc20Address: evmAddressSchema,
  /** The amount supplied, in the underlying's base units: the coin surrendered, re-minted when the deposit fails. */
  amount: amountSchema,
  state: supplyStateSchema,
  /** The circuit's `inIndex`: the request's slot in the vault's buffers, chosen at random. */
  inIndex: uint64Schema,
  /** The EVM account the MPC signs the deposit from: the vault's own, which holds the underlying and receives the shares. */
  vaultAccount: evmAddressSchema,
  /** Set with `Completed`. */
  outcome: supplyOutcomeSchema.nullable(),
  /** Set with `Failed`. */
  failure: supplyFailureSchema.nullable(),
  /** The child's message behind a failure, where there was one. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type Supply = z.infer<typeof supplySchema>

/** What the caller supplies to start a supply, the circuit's `SupplyRequest`. */
export const supplyRequestSchema = supplySchema.pick({ amount: true })

export type SupplyRequest = z.infer<typeof supplyRequestSchema>

/** What the server assigns to a start call, afresh on every `prepareStartSupply`: the slot, and the pinned underlying whose vault coin the call surrenders. */
export type SupplyStartInputs = Pick<Supply, 'inIndex' | 'underlyingErc20Address'>

/** What the complete circuit takes from the supply's attested request. */
export type SupplyCompleteInputs = CompletionInputs

/** The pinned pair a supply moves between, with what the vault account has allowed the wrapper so far. */
export const supplyTargetSchema = z.object({
  underlyingErc20Address: evmAddressSchema,
  stataErc20Address: evmAddressSchema,
  /** The wrapper's allowance on the underlying now, in the underlying's base units: a deposit executes only under one. */
  allowance: z.bigint().nonnegative(),
})

export type SupplyTarget = z.infer<typeof supplyTargetSchema>

export function supplyName(parent: string, id: string): string {
  return `${parent}/${SUPPLY_COLLECTION}/${id}`
}
