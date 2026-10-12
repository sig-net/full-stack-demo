import { z } from 'zod'

import {
  depositNameSchema,
  depositOutcomeSchema,
  type DepositState,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { amountSchema, evmAddressSchema } from '@/lib/value-schemas'

/** Where an activity stands, aggregated from its lifecycle row by the view. */
export const ACTIVITY_STATES = ['Pending', 'Complete', 'Failed'] as const

export const activityStateSchema = z.enum(ACTIVITY_STATES)

export type ActivityState = z.infer<typeof activityStateSchema>

/** How the view aggregates a deposit's state; a state not listed here is `Pending`. */
export const ACTIVITY_STATE_BY_DEPOSIT_STATE: Partial<Record<DepositState, ActivityState>> = {
  Completed: 'Complete',
  Failed: 'Failed',
}

/** The kinds of vault activity, one per lifecycle resource the view reads. */
export const ACTIVITY_TYPES = ['Deposit'] as const

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
})

export type ActivityTransaction = z.infer<typeof activityTransactionSchema>

/** The name of the resource an activity projects, one schema per activity type. */
export const activityNameSchema = depositNameSchema

/**
 * One row of the activity view: a lifecycle resource with its newest children projected onto
 * it. The row is read only, derived by the database from the lifecycle tables, and named after
 * the resource it projects.
 */
export const activitySchema = z.object({
  name: activityNameSchema,
  type: activityTypeSchema,
  state: activityStateSchema,
  /** The EVM account the activity moves funds through, which stands in for the caller. */
  depositAccount: evmAddressSchema,
  erc20Address: evmAddressSchema,
  amount: amountSchema,
  outcome: depositOutcomeSchema.nullable(),
  error: z.string().nullable(),
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

export type Activity = z.infer<typeof activitySchema>

/** The transaction of the furthest step reached, which a listing shows for the activity. */
export function latestTransactionOf(activity: Activity): ActivityTransaction | null {
  return (
    activity.completeTransaction ?? activity.foreignChainTransaction ?? activity.startTransaction
  )
}
