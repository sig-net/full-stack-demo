import type {
  EthereumTransaction,
  EthereumTransactionState,
} from '@/lib/ethereum/transaction-v1/transaction'

/** The state a transaction enters when `action` is applied in `state`, or undefined if refused. */
export function nextState(
  state: EthereumTransactionState,
  action: TransactionAction,
): EthereumTransactionState | undefined {
  return TRANSITIONS[state][action]
}

export type TransactionAction = 'recordSubmission' | 'recordSuccess' | 'recordFailure' | 'expire'

const TRANSITIONS: Record<
  EthereumTransactionState,
  Partial<Record<TransactionAction, EthereumTransactionState>>
> = {
  AwaitingSubmission: {
    recordSubmission: 'AwaitingInclusion',
    recordFailure: 'Failed',
    expire: 'Failed',
  },
  AwaitingInclusion: { recordSuccess: 'Succeeded', recordFailure: 'Failed', expire: 'Failed' },
  Succeeded: {},
  Failed: {},
}

/** The one state a transaction may be stored in before any action: signed and not yet sent. */
export const COMMITTABLE_STATES: readonly EthereumTransactionState[] = ['AwaitingSubmission']

/** The states in which `expireTime` passing ends the transaction. */
export const EXPIRABLE_STATES: readonly EthereumTransactionState[] = [
  'AwaitingSubmission',
  'AwaitingInclusion',
]

/** Throws unless the transaction holds exactly the chain fields its state requires. */
export function assertConsistent(transaction: EthereumTransaction): void {
  const { set, unset } = FIELDS_BY_STATE[transaction.state]
  for (const field of set) {
    if (transaction[field] === null) {
      throw new Error(`${transaction.name} in state ${transaction.state} must have ${field} set`)
    }
  }
  for (const field of unset) {
    if (transaction[field] !== null) {
      throw new Error(`${transaction.name} in state ${transaction.state} must have ${field} unset`)
    }
  }
}

type StepField = 'txHash' | 'blockNumber' | 'failure' | 'error'

/**
 * What each state holds. A field in neither list is free: a failure keeps whatever the chain
 * returned before it, and `expireTime` is never required.
 */
const FIELDS_BY_STATE: Record<
  EthereumTransactionState,
  { set: readonly StepField[]; unset: readonly StepField[] }
> = {
  AwaitingSubmission: { set: [], unset: ['txHash', 'blockNumber', 'failure', 'error'] },
  AwaitingInclusion: { set: ['txHash'], unset: ['blockNumber', 'failure', 'error'] },
  Succeeded: { set: ['txHash', 'blockNumber'], unset: ['failure', 'error'] },
  Failed: { set: ['failure'], unset: [] },
}
