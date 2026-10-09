import type {
  MidnightTransaction,
  MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'

/** The state a transaction enters when `action` is applied in `state`, or undefined if refused. */
export function nextState(
  state: MidnightTransactionState,
  action: TransactionAction,
): MidnightTransactionState | undefined {
  return TRANSITIONS[state][action]
}

export type TransactionAction =
  | 'recordProof'
  | 'recordProofFailure'
  | 'submit'
  | 'recordSubmission'
  | 'recordRejection'
  | 'recordSuccess'
  | 'expire'

const TRANSITIONS: Record<
  MidnightTransactionState,
  Partial<Record<TransactionAction, MidnightTransactionState>>
> = {
  AwaitingProof: { recordProof: 'AwaitingWallet', recordProofFailure: 'Failed', expire: 'Expired' },
  AwaitingWallet: { submit: 'AwaitingSubmission', expire: 'Expired' },
  AwaitingSubmission: {
    recordSubmission: 'AwaitingInclusion',
    recordRejection: 'Failed',
    expire: 'Expired',
  },
  AwaitingInclusion: { recordSuccess: 'Succeeded', recordRejection: 'Failed', expire: 'Expired' },
  Succeeded: {},
  Failed: {},
  Expired: {},
}

/** The states a transaction may be stored in before any action: built, or built and proven. */
export const COMMITTABLE_STATES: readonly MidnightTransactionState[] = [
  'AwaitingProof',
  'AwaitingWallet',
]

/** The states in which `expireTime` passing ends the transaction. */
export const EXPIRABLE_STATES: readonly MidnightTransactionState[] = [
  'AwaitingProof',
  'AwaitingWallet',
  'AwaitingSubmission',
  'AwaitingInclusion',
]

/** Throws unless the transaction holds exactly the step fields its state requires. */
export function assertConsistent(transaction: MidnightTransaction): void {
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

type StepField = 'unprovenTx' | 'unboundTx' | 'finalizedTx' | 'expireTime' | 'txId' | 'error'

/**
 * What each state holds. A field in neither list is free: a failure keeps whatever the step
 * before it produced. `unprovenTx` embeds the private transcript and is deleted on leaving
 * `AwaitingProof`.
 */
const FIELDS_BY_STATE: Record<
  MidnightTransactionState,
  { set: readonly StepField[]; unset: readonly StepField[] }
> = {
  AwaitingProof: {
    set: ['unprovenTx', 'expireTime'],
    unset: ['unboundTx', 'finalizedTx', 'txId', 'error'],
  },
  AwaitingWallet: {
    set: ['unboundTx', 'expireTime'],
    unset: ['unprovenTx', 'finalizedTx', 'txId', 'error'],
  },
  AwaitingSubmission: {
    set: ['unboundTx', 'finalizedTx', 'expireTime'],
    unset: ['unprovenTx', 'txId', 'error'],
  },
  AwaitingInclusion: {
    set: ['unboundTx', 'finalizedTx', 'expireTime', 'txId'],
    unset: ['unprovenTx', 'error'],
  },
  Succeeded: { set: ['txId'], unset: ['unprovenTx', 'error'] },
  Failed: { set: ['error'], unset: ['unprovenTx'] },
  Expired: { set: ['expireTime'], unset: ['unprovenTx', 'error'] },
}
