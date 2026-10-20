import {
  type CallerOperationEvents,
  callerOperationEvents,
  CallerOperationStateConflict,
  type CallerOperationStateController,
  type CompleteOperationArgs,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import { type Supply, supplyNameSchema } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { CommittedCall } from '@/lib/midnight/transaction-v1/transaction-state-machine'

/**
 * The only writer of a supply's state: the caller operation's transitions over the supply row,
 * plus the two user actions, `startSupply` and `completeSupply`, which also commit the caller's
 * circuit call under the supply. Methods open no transaction: the caller is the write boundary.
 */
export interface SupplyStateController extends CallerOperationStateController<Supply> {
  /** Stores a supply in `AwaitingStartTransaction` and commits the caller's start call under it. */
  startSupply(args: StartSupplyArgs): Promise<Supply>
  /** `AwaitingCompletion` to `AwaitingCompleteTransaction`, committing the caller's complete call under the supply. */
  completeSupply(args: CompleteSupplyArgs): Promise<Supply>
}

/** What the starter decides. The controller sets the entry state, the outcome fields, and the timestamps. */
export interface StartSupplyArgs extends Omit<
  Supply,
  'state' | 'outcome' | 'failure' | 'error' | 'createTime' | 'updateTime'
> {
  /** The start circuit call, built with the supply's assigned fields. */
  call: CommittedCall
}

export type CompleteSupplyArgs = CompleteOperationArgs

/** The supply is not in a state the action applies to, so another actor got there first. */
export class SupplyStateConflict extends CallerOperationStateConflict {
  readonly name = 'SupplyStateConflict'
}

/** One lifecycle event per state entered, keyed by the supply name. */
export const SUPPLY_EVENT_BY_STATE: CallerOperationEvents = callerOperationEvents(
  'midnight.ethereum-erc20-vault.supply-v1',
  supplyNameSchema,
)

export const SUPPLY_EVENTS = Object.values(SUPPLY_EVENT_BY_STATE)
