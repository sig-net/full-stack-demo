import { z } from 'zod'

import { ethereumTransactionStateSchema } from '@/lib/ethereum/transaction-v1/transaction'
import {
  approvalNameSchema,
  approvalOutcomeSchema,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import {
  type CallerOperationState,
  callerOperationStateSchema,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
import {
  depositNameSchema,
  depositOutcomeSchema,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { swapNameSchema, swapOutcomeSchema } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import { vaultRequestStateSchema } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  midnightTransactionNameSchema,
  type MidnightTransactionSigner,
  type MidnightTransactionState,
  midnightTransactionStateSchema,
} from '@/lib/midnight/transaction-v1/transaction'
import { amountSchema, evmAddressSchema, hex32BytesSchema } from '@/lib/value-schemas'

/** Where an activity stands, aggregated from its lifecycle row by the view. */
export const ACTIVITY_STATES = ['Pending', 'Complete', 'Failed'] as const

export const activityStateSchema = z.enum(ACTIVITY_STATES)

export type ActivityState = z.infer<typeof activityStateSchema>

/** How the view aggregates an operation's state; a state not listed here is `Pending`. */
export const ACTIVITY_STATE_BY_OPERATION_STATE: Partial<
  Record<CallerOperationState, ActivityState>
> = {
  Completed: 'Complete',
  Failed: 'Failed',
}

/** The kinds of vault activity, one per caller operation the view reads. */
export const ACTIVITY_TYPES = ['Deposit', 'Swap', 'Approval'] as const

export const activityTypeSchema = z.enum(ACTIVITY_TYPES)

export type ActivityType = z.infer<typeof activityTypeSchema>

/** Where one of an activity's transactions stands, aggregated from the transaction's state. */
export const ACTIVITY_TRANSACTION_STATES = ['Pending', 'Succeeded', 'Failed'] as const

export const activityTransactionStateSchema = z.enum(ACTIVITY_TRANSACTION_STATES)

export type ActivityTransactionState = z.infer<typeof activityTransactionStateSchema>

/** How the view aggregates a transaction's state, on either chain; a state not listed here is `Pending`. */
export const ACTIVITY_TRANSACTION_STATE_BY_STATE: Partial<
  Record<string, ActivityTransactionState>
> = { Succeeded: 'Succeeded', Failed: 'Failed' }

/** One of the activity's transactions, as the view projects the newest child of its kind. */
export const activityTransactionSchema = z.object({
  /** The chain's identifier, null until the transaction reached the node. */
  hash: z.string().nullable(),
  state: activityTransactionStateSchema,
  /** The transaction's own state, which says what it waits for. */
  lifecycleState: z.union([midnightTransactionStateSchema, ethereumTransactionStateSchema]),
})

export type ActivityTransaction = z.infer<typeof activityTransactionSchema>

/** The state and signer of a Midnight transaction the caller's wallet must balance, as the view selects it. */
export const ACTIVITY_WALLET_TRANSACTION_STATE = 'AwaitingWallet' satisfies MidnightTransactionState
export const ACTIVITY_WALLET_TRANSACTION_SIGNER = 'caller' satisfies MidnightTransactionSigner

/** The caller's Midnight transaction waiting for the wallet, with the circuit it carries and its deadline. */
export const activityWalletTransactionSchema = z.object({
  name: midnightTransactionNameSchema,
  circuit: z.string(),
  /** The view carries it through JSON as text, so the schema accepts both forms. */
  expireTime: z.coerce.date().nullable(),
})

export type ActivityWalletTransaction = z.infer<typeof activityWalletTransactionSchema>

/**
 * The fields every activity row carries: the projected operation with its newest children.
 * `erc20Address` and `amount` are what the operation surrenders or moves, the out side and the
 * spender belong to one type each, and each type keeps `outcome` to its own set.
 */
const activityFieldsSchema = z.object({
  state: activityStateSchema,
  erc20Address: evmAddressSchema,
  error: z.string().nullable(),
  /** The operation's own state, which says what it waits for. */
  resourceState: callerOperationStateSchema,
  /** The newest vault request's own state, null before the request exists. */
  vaultRequestState: vaultRequestStateSchema.nullable(),
  /** The id the MPC recorded the newest vault request under, null until the request is sent. */
  vaultRequestId: hex32BytesSchema.nullable(),
  /** The newest caller transaction the wallet must balance now, null when none waits. */
  walletTransaction: activityWalletTransactionSchema.nullable(),
  /** The caller's call that put the request on the vault. */
  startTransaction: activityTransactionSchema.nullable(),
  /** The MPC-signed transaction on the foreign chain. */
  foreignChainTransaction: activityTransactionSchema.nullable(),
  /** The caller's call that settled the request. */
  completeTransaction: activityTransactionSchema.nullable(),
  createTime: z.date(),
  /** The newest update across the row and its projected children. */
  updateTime: z.date(),
})

/** A deposit: `amount` of `erc20Address` moving from the deposit account into the vault. */
export const depositActivitySchema = activityFieldsSchema.extend({
  name: depositNameSchema,
  type: z.literal('Deposit'),
  amount: amountSchema,
  erc20AddressOut: z.null(),
  amountOut: z.null(),
  spender: z.null(),
  outcome: depositOutcomeSchema.nullable(),
})

/** A swap: up to `amount` of `erc20Address` sold for exactly `amountOut` of `erc20AddressOut`. */
export const swapActivitySchema = activityFieldsSchema.extend({
  name: swapNameSchema,
  type: z.literal('Swap'),
  amount: amountSchema,
  erc20AddressOut: evmAddressSchema,
  amountOut: amountSchema,
  spender: z.null(),
  outcome: swapOutcomeSchema.nullable(),
})

/** An approval: the vault account allowing `spender` to move `erc20Address`. */
export const approvalActivitySchema = activityFieldsSchema.extend({
  name: approvalNameSchema,
  type: z.literal('Approval'),
  amount: z.null(),
  erc20AddressOut: z.null(),
  amountOut: z.null(),
  spender: evmAddressSchema,
  outcome: approvalOutcomeSchema.nullable(),
})

/**
 * One row of the activity view: a caller operation with its newest children projected onto it.
 * The row is read only, derived by the database from the lifecycle tables, and named after the
 * resource it projects.
 */
export const activitySchema = z.discriminatedUnion('type', [
  depositActivitySchema,
  swapActivitySchema,
  approvalActivitySchema,
])

export type Activity = z.infer<typeof activitySchema>

export type DepositActivity = z.infer<typeof depositActivitySchema>
export type SwapActivity = z.infer<typeof swapActivitySchema>
export type ApprovalActivity = z.infer<typeof approvalActivitySchema>

/** The name of the resource an activity projects, in any of the three forms. */
export const activityNameSchema = z.union([depositNameSchema, swapNameSchema, approvalNameSchema])
