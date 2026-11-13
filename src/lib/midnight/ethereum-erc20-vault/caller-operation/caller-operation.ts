import { z } from 'zod'

/**
 * The fields every caller-started vault operation carries: a deposit, a swap and an approval
 * each start with the caller's circuit call, wait on one vault request, and end with the
 * caller's complete call, so they share one lifecycle and one row shape around their own
 * request fields. A resource file keeps `outcome` to its own closed set.
 */
export interface CallerOperation {
  readonly name: string
  readonly state: CallerOperationState
  /** The start circuit's `inIndex`: the request's slot in the vault's buffers, chosen at random. */
  readonly inIndex: bigint
  /** Set with `Completed`. */
  readonly outcome: string | null
  /** Set with `Failed`. */
  readonly failure: CallerOperationFailure | null
  /** The child's message behind a failure, where there was one. */
  readonly error: string | null
  readonly createTime: Date
  readonly updateTime: Date
}

/** Each state names what the operation waits for, so it is a to-do for exactly one actor. */
export const CALLER_OPERATION_STATES = [
  'AwaitingStartTransaction',
  'AwaitingVaultRequest',
  'AwaitingCompletion',
  'AwaitingCompleteTransaction',
  'Completed',
  'Failed',
] as const

export const callerOperationStateSchema = z.enum(CALLER_OPERATION_STATES)

export type CallerOperationState = z.infer<typeof callerOperationStateSchema>

/** The states an operation never leaves. */
export const CALLER_OPERATION_TERMINAL_STATES = [
  'Completed',
  'Failed',
] as const satisfies readonly CallerOperationState[]

export function isTerminalCallerOperationState(state: CallerOperationState): boolean {
  return CALLER_OPERATION_TERMINAL_STATES.some((terminal) => terminal === state)
}

/** The states a resolver still has work for. */
export const CALLER_OPERATION_PENDING_STATES: readonly CallerOperationState[] =
  CALLER_OPERATION_STATES.filter((state) => !isTerminalCallerOperationState(state))

/** Why an operation failed: the start transaction ended without queueing the request. */
export const CALLER_OPERATION_FAILURES = ['StartFailed'] as const

export const callerOperationFailureSchema = z.enum(CALLER_OPERATION_FAILURES)

export type CallerOperationFailure = z.infer<typeof callerOperationFailureSchema>
