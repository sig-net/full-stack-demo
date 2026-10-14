import {
  type CallerOperationEvents,
  callerOperationEvents,
  CallerOperationStateConflict,
  type CallerOperationStateController,
  type CompleteOperationArgs,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import {
  type Withdraw,
  withdrawNameSchema,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'

/**
 * The only writer of a withdrawal's state: the caller operation's transitions over the withdraw
 * row, plus the two user actions, `startWithdraw` and `completeWithdraw`, which also commit the
 * caller's circuit call under the withdrawal. Methods open no transaction: the caller is the
 * write boundary.
 */
export interface WithdrawStateController extends CallerOperationStateController<Withdraw> {
  /** Stores a withdrawal in `AwaitingStartTransaction` and commits the caller's start call under it. */
  startWithdraw(args: StartWithdrawArgs): Promise<Withdraw>
  /** `AwaitingCompletion` to `AwaitingCompleteTransaction`, committing the caller's complete call under the withdrawal. */
  completeWithdraw(args: CompleteWithdrawArgs): Promise<Withdraw>
}

/** What the starter decides. The controller sets the entry state, the outcome fields, and the timestamps. */
export interface StartWithdrawArgs extends Omit<
  Withdraw,
  'state' | 'outcome' | 'failure' | 'error' | 'createTime' | 'updateTime'
> {
  /** The start circuit call, built with the withdrawal's assigned fields. */
  unprovenTx: string
}

export type CompleteWithdrawArgs = CompleteOperationArgs

/** The withdrawal is not in a state the action applies to, so another actor got there first. */
export class WithdrawStateConflict extends CallerOperationStateConflict {
  readonly name = 'WithdrawStateConflict'
}

/** One lifecycle event per state entered, keyed by the withdraw name. */
export const WITHDRAW_EVENT_BY_STATE: CallerOperationEvents = callerOperationEvents(
  'midnight.ethereum-erc20-vault.withdraw-v1',
  withdrawNameSchema,
)

export const WITHDRAW_EVENTS = Object.values(WITHDRAW_EVENT_BY_STATE)
