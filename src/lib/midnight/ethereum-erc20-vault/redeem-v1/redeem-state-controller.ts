import {
  type CallerOperationEvents,
  callerOperationEvents,
  CallerOperationStateConflict,
  type CallerOperationStateController,
  type CompleteOperationArgs,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import { type Redeem, redeemNameSchema } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { BoundCall } from '@/lib/midnight/transaction-v1/transaction-state-machine'

/**
 * The only writer of a redeem's state: the caller operation's transitions over the redeem row,
 * plus the two user actions, `startRedeem` and `completeRedeem`, which also commit the caller's
 * circuit call under the redeem. Methods open no transaction: the caller is the write boundary.
 */
export interface RedeemStateController extends CallerOperationStateController<Redeem> {
  /** Stores a redeem in `AwaitingStartTransaction` and commits the caller's start call under it. */
  startRedeem(args: StartRedeemArgs): Promise<Redeem>
  /** `AwaitingCompletion` to `AwaitingCompleteTransaction`, committing the caller's complete call under the redeem. */
  completeRedeem(args: CompleteRedeemArgs): Promise<Redeem>
}

/** What the starter decides. The controller sets the entry state, the outcome fields, and the timestamps. */
export interface StartRedeemArgs extends Omit<
  Redeem,
  'state' | 'outcome' | 'failure' | 'error' | 'createTime' | 'updateTime'
> {
  /** The start circuit call, built with the redeem's assigned fields. */
  call: BoundCall
}

export type CompleteRedeemArgs = CompleteOperationArgs

/** The redeem is not in a state the action applies to, so another actor got there first. */
export class RedeemStateConflict extends CallerOperationStateConflict {
  readonly name = 'RedeemStateConflict'
}

/** One lifecycle event per state entered, keyed by the redeem name. */
export const REDEEM_EVENT_BY_STATE: CallerOperationEvents = callerOperationEvents(
  'midnight.ethereum-erc20-vault.redeem-v1',
  redeemNameSchema,
)

export const REDEEM_EVENTS = Object.values(REDEEM_EVENT_BY_STATE)
