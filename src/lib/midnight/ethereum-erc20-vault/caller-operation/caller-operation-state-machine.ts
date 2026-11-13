import type {
  CallerOperation,
  CallerOperationState,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'

/** The state an operation enters when `action` is applied in `state`, or undefined if refused. */
export function nextState(
  state: CallerOperationState,
  action: CallerOperationStateAction,
): CallerOperationState | undefined {
  return TRANSITIONS[state][action]
}

export type CallerOperationStateAction =
  | 'recordStarted'
  | 'recordStartFailure'
  | 'recordAttested'
  | 'complete'
  | 'recordCompleted'
  | 'recordCompleteFailure'

const TRANSITIONS: Record<
  CallerOperationState,
  Partial<Record<CallerOperationStateAction, CallerOperationState>>
> = {
  AwaitingStartTransaction: {
    recordStarted: 'AwaitingVaultRequest',
    recordStartFailure: 'Failed',
  },
  AwaitingVaultRequest: { recordAttested: 'AwaitingCompletion' },
  AwaitingCompletion: { complete: 'AwaitingCompleteTransaction', recordCompleted: 'Completed' },
  AwaitingCompleteTransaction: {
    recordCompleted: 'Completed',
    recordCompleteFailure: 'AwaitingCompletion',
  },
  Completed: {},
  Failed: {},
}

/** The state an operation is started in. */
export const INITIAL_STATE: CallerOperationState = 'AwaitingStartTransaction'

/** Throws unless the operation holds exactly the outcome fields its state requires. */
export function assertConsistent(
  operation: Pick<CallerOperation, 'name' | 'state' | 'outcome' | 'failure' | 'error'>,
): void {
  const { set, unset } = FIELDS_BY_STATE[operation.state]
  for (const field of set) {
    if (operation[field] === null) {
      throw new Error(`${operation.name} in state ${operation.state} must have ${field} set`)
    }
  }
  for (const field of unset) {
    if (operation[field] !== null) {
      throw new Error(`${operation.name} in state ${operation.state} must have ${field} unset`)
    }
  }
}

type OutcomeField = 'outcome' | 'failure' | 'error'

const WAITING = { set: [], unset: ['outcome', 'failure', 'error'] } as const

/** What each state holds. `error` is free on `Failed`: a child may fail without a message. */
const FIELDS_BY_STATE: Record<
  CallerOperationState,
  { set: readonly OutcomeField[]; unset: readonly OutcomeField[] }
> = {
  AwaitingStartTransaction: WAITING,
  AwaitingVaultRequest: WAITING,
  AwaitingCompletion: WAITING,
  AwaitingCompleteTransaction: WAITING,
  Completed: { set: ['outcome'], unset: ['failure', 'error'] },
  Failed: { set: ['failure'], unset: ['outcome'] },
}
