import {
  type CallerOperationEvents,
  callerOperationEvents,
  CallerOperationStateConflict,
  type CallerOperationStateController,
  type CompleteOperationArgs,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import { type Swap, swapNameSchema } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { CommittedCall } from '@/lib/midnight/transaction-v1/transaction-state-machine'

/**
 * The only writer of a swap's state: the caller operation's transitions over the swap row,
 * plus the two user actions, `startSwap` and `completeSwap`, which also commit the caller's
 * circuit call under the swap. Methods open no transaction: the caller is the write boundary.
 */
export interface SwapStateController extends CallerOperationStateController<Swap> {
  /** Stores a swap in `AwaitingStartTransaction` and commits the caller's start call under it. */
  startSwap(args: StartSwapArgs): Promise<Swap>
  /** `AwaitingCompletion` to `AwaitingCompleteTransaction`, committing the caller's complete call under the swap. */
  completeSwap(args: CompleteSwapArgs): Promise<Swap>
}

/** What the starter decides. The controller sets the entry state, the outcome fields, and the timestamps. */
export interface StartSwapArgs extends Omit<
  Swap,
  'state' | 'outcome' | 'failure' | 'error' | 'createTime' | 'updateTime'
> {
  /** The start circuit call, built with the swap's assigned fields. */
  call: CommittedCall
}

export type CompleteSwapArgs = CompleteOperationArgs

/** The swap is not in a state the action applies to, so another actor got there first. */
export class SwapStateConflict extends CallerOperationStateConflict {
  readonly name = 'SwapStateConflict'
}

/** One lifecycle event per state entered, keyed by the swap name. */
export const SWAP_EVENT_BY_STATE: CallerOperationEvents = callerOperationEvents(
  'midnight.ethereum-erc20-vault.swap-v1',
  swapNameSchema,
)

export const SWAP_EVENTS = Object.values(SWAP_EVENT_BY_STATE)
