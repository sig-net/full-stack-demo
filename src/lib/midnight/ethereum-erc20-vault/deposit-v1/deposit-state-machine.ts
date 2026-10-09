import type { Deposit, DepositState } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'

/** The state a deposit enters when `action` is applied in `state`, or undefined if refused. */
export function nextState(
  state: DepositState,
  action: DepositStateAction,
): DepositState | undefined {
  return TRANSITIONS[state][action]
}

export type DepositStateAction =
  | 'recordStarted'
  | 'recordStartFailure'
  | 'recordAttested'
  | 'complete'
  | 'recordCompleted'
  | 'recordCompleteFailure'

const TRANSITIONS: Record<DepositState, Partial<Record<DepositStateAction, DepositState>>> = {
  AwaitingStartTransaction: {
    recordStarted: 'AwaitingVaultRequest',
    recordStartFailure: 'Failed',
  },
  AwaitingVaultRequest: { recordAttested: 'AwaitingCompletion' },
  AwaitingCompletion: { complete: 'AwaitingCompleteTransaction' },
  AwaitingCompleteTransaction: {
    recordCompleted: 'Completed',
    recordCompleteFailure: 'AwaitingCompletion',
  },
  Completed: {},
  Failed: {},
}

/** The states a deposit may be stored in before any action. */
export const COMMITTABLE_STATES: readonly DepositState[] = ['AwaitingStartTransaction']

/** Throws unless the deposit holds exactly the outcome fields its state requires. */
export function assertConsistent(deposit: Deposit): void {
  const { set, unset } = FIELDS_BY_STATE[deposit.state]
  for (const field of set) {
    if (deposit[field] === null) {
      throw new Error(`${deposit.name} in state ${deposit.state} must have ${field} set`)
    }
  }
  for (const field of unset) {
    if (deposit[field] !== null) {
      throw new Error(`${deposit.name} in state ${deposit.state} must have ${field} unset`)
    }
  }
}

type OutcomeField = 'outcome' | 'failure' | 'error'

const WAITING = { set: [], unset: ['outcome', 'failure', 'error'] } as const

/** What each state holds. `error` is free on `Failed`: a child may fail without a message. */
const FIELDS_BY_STATE: Record<
  DepositState,
  { set: readonly OutcomeField[]; unset: readonly OutcomeField[] }
> = {
  AwaitingStartTransaction: WAITING,
  AwaitingVaultRequest: WAITING,
  AwaitingCompletion: WAITING,
  AwaitingCompleteTransaction: WAITING,
  Completed: { set: ['outcome'], unset: ['failure', 'error'] },
  Failed: { set: ['failure'], unset: ['outcome'] },
}
