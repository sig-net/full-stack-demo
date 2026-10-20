import {
  type CallerOperationEventData,
  type CallerOperationEvents,
  callerOperationEvents,
  CallerOperationStateConflict,
  type CallerOperationStateController,
  type CompleteOperationArgs,
  type RecordCompletedArgs as RecordCompletedOperationArgs,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import {
  type Deposit,
  depositNameSchema,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { CommittedCall } from '@/lib/midnight/transaction-v1/transaction-state-machine'

/**
 * The only writer of a deposit's state: the caller operation's transitions over the deposit
 * row, plus the two user actions, `startDeposit` and `completeDeposit`, which also commit the
 * caller's circuit call under the deposit. Methods open no transaction: the caller is the
 * write boundary.
 */
export interface DepositStateController extends CallerOperationStateController<Deposit> {
  /** Stores a deposit in `AwaitingStartTransaction` and commits the caller's start call under it. */
  startDeposit(args: StartDepositArgs): Promise<Deposit>
  /** `AwaitingCompletion` to `AwaitingCompleteTransaction`, committing the caller's complete call under the deposit. */
  completeDeposit(args: CompleteDepositArgs): Promise<Deposit>
}

/** What the starter decides. The controller sets the entry state, the outcome fields, and the timestamps. */
export interface StartDepositArgs extends Omit<
  Deposit,
  'state' | 'outcome' | 'failure' | 'error' | 'createTime' | 'updateTime'
> {
  /** The start circuit call, built with the deposit's assigned fields. */
  call: CommittedCall
}

export type CompleteDepositArgs = CompleteOperationArgs

export type {
  RecordAttestedArgs,
  RecordCompleteFailureArgs,
  RecordStartedArgs,
  RecordStartFailureArgs,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'

export type RecordCompletedArgs = RecordCompletedOperationArgs<Deposit>

/** The deposit is not in a state the action applies to, so another actor got there first. */
export class DepositStateConflict extends CallerOperationStateConflict {
  readonly name = 'DepositStateConflict'
}

export type DepositEventData = CallerOperationEventData

/** One lifecycle event per state entered, keyed by the deposit name. */
export const DEPOSIT_EVENT_BY_STATE: CallerOperationEvents = callerOperationEvents(
  'midnight.ethereum-erc20-vault.deposit-v1',
  depositNameSchema,
)

export const DEPOSIT_EVENTS = Object.values(DEPOSIT_EVENT_BY_STATE)
