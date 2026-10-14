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
  shieldedAddressSchema,
  uint64Schema,
  uint128Schema,
  UUID,
} from '@/lib/value-schemas'

/** The collection segment of a deposit's resource name. */
export const DEPOSIT_COLLECTION = 'ethereum-erc20-vault-deposits'

/** `callers/{caller}/ethereum-erc20-vault-deposits/{deposit}`, where the deposit is a UUID. */
export const depositNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${DEPOSIT_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${DEPOSIT_COLLECTION}/{uuid}`,
  )

/** The deposit's lifecycle is the caller operation's, under its own names. */
export const DEPOSIT_STATES = CALLER_OPERATION_STATES

export const depositStateSchema = callerOperationStateSchema

export type DepositState = CallerOperationState

export const DEPOSIT_TERMINAL_STATES = CALLER_OPERATION_TERMINAL_STATES

export const isTerminalDepositState = isTerminalCallerOperationState

export const DEPOSIT_PENDING_STATES = CALLER_OPERATION_PENDING_STATES

export const DEPOSIT_FAILURES = CALLER_OPERATION_FAILURES

export const depositFailureSchema = callerOperationFailureSchema

export type DepositFailure = CallerOperationFailure

/** What the complete circuit did: minted the tokens the sweep moved, or closed a request whose sweep moved nothing. */
export const DEPOSIT_OUTCOMES = ['minted', 'closed'] as const

export const depositOutcomeSchema = z.enum(DEPOSIT_OUTCOMES)

export type DepositOutcome = z.infer<typeof depositOutcomeSchema>

/**
 * The deposit resource. The caller supplies the request (`erc20Address`, `amount`), the server
 * assigns everything else before the `startDeposit` circuit is built. The transactions and the
 * vault request behind its steps name it as their parent, so its children are found through
 * their repositories.
 */
export const depositSchema = z.object({
  name: depositNameSchema,
  erc20Address: evmAddressSchema,
  amount: amountSchema,
  state: depositStateSchema,
  /** The circuit's `inIndex`: the request's slot in the vault's buffers, chosen at random. */
  inIndex: uint64Schema,
  /** The nonce the MPC signs the sweep with, one above any live deposit's and at least the chain's pending count. */
  evmNonce: uint64Schema,
  /** The circuit's `GasParams` for the sweep. */
  gasLimit: uint64Schema,
  maxFeePerGas: uint128Schema,
  maxPriorityFeePerGas: uint128Schema,
  /** The EVM account the user funds and the MPC sweeps from, derived from the caller's commitment. */
  depositAccount: evmAddressSchema,
  /** The shielded address of the wallet the start call was built for, which the completion mints to, null on a row stored without one. */
  recipient: shieldedAddressSchema.nullable(),
  /** Set with `Completed`. */
  outcome: depositOutcomeSchema.nullable(),
  /** Set with `Failed`. */
  failure: depositFailureSchema.nullable(),
  /** The child's message behind a failure, where there was one. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type Deposit = z.infer<typeof depositSchema>

/** What the caller supplies to start a deposit, the circuit's `DepositRequest`. */
export const depositRequestSchema = depositSchema.pick({ erc20Address: true, amount: true })

export type DepositRequest = z.infer<typeof depositRequestSchema>

export function depositName(parent: string, id: string): string {
  return `${parent}/${DEPOSIT_COLLECTION}/${id}`
}
