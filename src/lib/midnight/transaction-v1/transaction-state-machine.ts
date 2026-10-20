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
  | 'recordFee'
  | 'recordSubmission'
  | 'recordRejection'
  | 'recordLedgerFailure'
  | 'recordSuccess'
  | 'expire'

const TRANSITIONS: Record<
  MidnightTransactionState,
  Partial<Record<TransactionAction, MidnightTransactionState>>
> = {
  AwaitingProof: { recordProof: 'AwaitingWallet', recordProofFailure: 'Failed', expire: 'Failed' },
  AwaitingWallet: { submit: 'AwaitingSubmission', expire: 'Failed' },
  AwaitingFee: { recordFee: 'AwaitingSubmission', expire: 'Failed' },
  AwaitingSubmission: {
    recordSubmission: 'AwaitingInclusion',
    recordRejection: 'Failed',
    expire: 'Failed',
  },
  AwaitingInclusion: {
    recordSuccess: 'Succeeded',
    recordLedgerFailure: 'Failed',
    expire: 'Failed',
  },
  Succeeded: {},
  Failed: {},
}

/** The bytes a call is committed with: unproven from the backend's builder, or bound by the caller's wallet without a fee. */
export type CommittedCall = UnprovenCall | BoundCall

/** A call the backend built for the relayer's wallet, which the resolver proves, balances and signs. */
export type UnprovenCall = { unprovenTx: string }

/** A call the caller's wallet proved and bound without a fee, for the relayer to pay. */
export type BoundCall = { boundTx: string }

/** The state a committed call enters, by the bytes it arrives with: unproven bytes wait for the proof, bound bytes wait for the relayer's fee. */
export const ENTRY_STATE_BY_CALL: Record<CommittedCallKind, MidnightTransactionState> = {
  unprovenTx: 'AwaitingProof',
  boundTx: 'AwaitingFee',
}

export function entryState(call: CommittedCall): MidnightTransactionState {
  return 'unprovenTx' in call ? ENTRY_STATE_BY_CALL.unprovenTx : ENTRY_STATE_BY_CALL.boundTx
}

/** The field that names each kind of committed call. */
type CommittedCallKind = KeyOfEach<CommittedCall>

type KeyOfEach<Union> = Union extends unknown ? keyof Union : never

/** The states in which `expireTime` passing ends the transaction. */
export const EXPIRABLE_STATES: readonly MidnightTransactionState[] = [
  'AwaitingProof',
  'AwaitingWallet',
  'AwaitingFee',
  'AwaitingSubmission',
  'AwaitingInclusion',
]

/** Throws unless the transaction holds exactly the step fields its state requires. */
export function assertConsistent(transaction: MidnightTransaction): void {
  const signer = SIGNER_BY_STATE[transaction.state]
  if (signer !== undefined && transaction.signer !== signer) {
    throw new Error(
      `${transaction.name} in state ${transaction.state} must be signed by the ${signer}`,
    )
  }
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

/** A relayer call is committed unproven and a caller call bound, so the entry states and the wallet's to-do name their signer. */
const SIGNER_BY_STATE: Partial<Record<MidnightTransactionState, MidnightTransaction['signer']>> = {
  AwaitingProof: 'relayer',
  AwaitingWallet: 'relayer',
  AwaitingFee: 'caller',
}

type StepField =
  | 'unprovenTx'
  | 'unboundTx'
  | 'boundTx'
  | 'finalizedTx'
  | 'expireTime'
  | 'txId'
  | 'blockHeight'
  | 'failure'
  | 'error'

/**
 * What each state holds. A field in neither list is free: a failure keeps whatever the step
 * before it produced, and from `AwaitingSubmission` on a call holds `unboundTx` when the backend
 * proved it for the relayer's wallet, the one signer whose rows reach `AwaitingWallet`, or
 * `boundTx` when the caller's wallet bound it. `unprovenTx` embeds the private transcript and is
 * deleted on leaving `AwaitingProof`.
 */
const FIELDS_BY_STATE: Record<
  MidnightTransactionState,
  { set: readonly StepField[]; unset: readonly StepField[] }
> = {
  AwaitingProof: {
    set: ['unprovenTx', 'expireTime'],
    unset: ['unboundTx', 'boundTx', 'finalizedTx', 'txId', 'blockHeight', 'failure', 'error'],
  },
  AwaitingWallet: {
    set: ['unboundTx', 'expireTime'],
    unset: ['unprovenTx', 'boundTx', 'finalizedTx', 'txId', 'blockHeight', 'failure', 'error'],
  },
  AwaitingFee: {
    set: ['boundTx', 'expireTime'],
    unset: ['unprovenTx', 'unboundTx', 'finalizedTx', 'txId', 'blockHeight', 'failure', 'error'],
  },
  AwaitingSubmission: {
    set: ['finalizedTx', 'expireTime'],
    unset: ['unprovenTx', 'txId', 'blockHeight', 'failure', 'error'],
  },
  AwaitingInclusion: {
    set: ['finalizedTx', 'expireTime', 'txId'],
    unset: ['unprovenTx', 'blockHeight', 'failure', 'error'],
  },
  Succeeded: { set: ['txId', 'blockHeight'], unset: ['unprovenTx', 'failure', 'error'] },
  Failed: { set: ['failure'], unset: ['unprovenTx'] },
}
