import { z } from 'zod'

import { defineEvent, type EventDefinition } from '@/lib/event/event'
import type {
  CallerOperation,
  CallerOperationState,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
import type { BoundCall } from '@/lib/midnight/transaction-v1/transaction-state-machine'

/**
 * The transitions every caller operation's controller records, one per action of the state
 * machine in `caller-operation-state-machine.ts`. A resource's own controller adds the two
 * user actions that commit the caller's circuit calls, and refuses with its own conflict error.
 */
export interface CallerOperationStateController<Resource extends CallerOperation> {
  /** `AwaitingStartTransaction` to `AwaitingVaultRequest`, queueing the vault request the start call put on chain. */
  recordStarted(args: RecordStartedArgs): Promise<Resource>
  /** `AwaitingStartTransaction` to `Failed` as `StartFailed`. */
  recordStartFailure(args: RecordStartFailureArgs): Promise<Resource>
  /** `AwaitingVaultRequest` to `AwaitingCompletion`, once the vault request is attested. */
  recordAttested(args: RecordAttestedArgs): Promise<Resource>
  /** `AwaitingCompleteTransaction` or `AwaitingCompletion` to `Completed`, with what the complete call did. */
  recordCompleted(args: RecordCompletedArgs<Resource>): Promise<Resource>
  /** `AwaitingCompleteTransaction` back to `AwaitingCompletion`: the caller may complete again. */
  recordCompleteFailure(args: RecordCompleteFailureArgs): Promise<Resource>
}

export interface RecordStartedArgs {
  name: string
}

export interface RecordStartFailureArgs {
  name: string
  error: string
}

export interface RecordAttestedArgs {
  name: string
}

export interface RecordCompletedArgs<Resource extends CallerOperation> {
  name: string
  outcome: NonNullable<Resource['outcome']>
}

export interface RecordCompleteFailureArgs {
  name: string
}

export interface CompleteOperationArgs {
  name: string
  /** The complete circuit call, built for the operation's attested request, as the bytes it is committed with. */
  call: BoundCall
}

/** The operation is not in a state the action applies to, so another actor got there first. */
export class CallerOperationStateConflict extends Error {
  /** The name of the resource whose state refused the action. */
  readonly resource: string
  readonly state: CallerOperationState
  readonly action: string

  constructor(resource: string, state: CallerOperationState, action: string) {
    super(`${resource} is ${state}, which does not allow ${action}`)
    this.resource = resource
    this.state = state
    this.action = action
  }
}

/** A caller operation has no parent, so its events name only the operation. */
export type CallerOperationEventData = { readonly name: string }

/** One lifecycle event per state entered, keyed by the operation name. */
export type CallerOperationEvents = Readonly<
  Record<CallerOperationState, EventDefinition<CallerOperationEventData>>
>

/** The events of one resource, typed `<prefix>.<state>` with the state in kebab case. */
export function callerOperationEvents(
  prefix: string,
  nameSchema: z.ZodType<string>,
): CallerOperationEvents {
  const dataSchema = z.object({ name: nameSchema })
  const event = (state: CallerOperationState): EventDefinition<CallerOperationEventData> =>
    defineEvent(`${prefix}.${EVENT_SUFFIX_BY_STATE[state]}`, dataSchema)
  return {
    AwaitingStartTransaction: event('AwaitingStartTransaction'),
    AwaitingVaultRequest: event('AwaitingVaultRequest'),
    AwaitingCompletion: event('AwaitingCompletion'),
    AwaitingCompleteTransaction: event('AwaitingCompleteTransaction'),
    Completed: event('Completed'),
    Failed: event('Failed'),
  }
}

const EVENT_SUFFIX_BY_STATE: Record<CallerOperationState, string> = {
  AwaitingStartTransaction: 'awaiting-start-transaction',
  AwaitingVaultRequest: 'awaiting-vault-request',
  AwaitingCompletion: 'awaiting-completion',
  AwaitingCompleteTransaction: 'awaiting-complete-transaction',
  Completed: 'completed',
  Failed: 'failed',
}
