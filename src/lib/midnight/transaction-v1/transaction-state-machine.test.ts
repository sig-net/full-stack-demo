import { describe, expect, test } from 'vitest'

import {
  MIDNIGHT_TRANSACTION_STATES,
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'
import {
  CALLER_BOUND_TRANSACTION_AWAITING_SUBMISSION,
  TRANSACTION_IN_STATE,
  transactionFixture,
} from '@/lib/midnight/transaction-v1/transaction-fixtures'
import {
  assertConsistent,
  type CommittedCall,
  ENTRY_STATE_BY_CALL,
  entryState,
  EXPIRABLE_STATES,
  nextState,
  type TransactionAction,
} from '@/lib/midnight/transaction-v1/transaction-state-machine'

const ACTIONS: readonly TransactionAction[] = [
  'recordProof',
  'recordProofFailure',
  'submit',
  'recordFee',
  'recordSubmission',
  'recordRejection',
  'recordLedgerFailure',
  'recordSuccess',
  'expire',
]

/** Every allowed transition. Any pair not listed here must be refused. */
const ALLOWED: ReadonlyArray<
  [MidnightTransactionState, TransactionAction, MidnightTransactionState]
> = [
  ['AwaitingProof', 'recordProof', 'AwaitingWallet'],
  ['AwaitingProof', 'recordProofFailure', 'Failed'],
  ['AwaitingProof', 'expire', 'Failed'],
  ['AwaitingWallet', 'submit', 'AwaitingSubmission'],
  ['AwaitingWallet', 'expire', 'Failed'],
  ['AwaitingFee', 'recordFee', 'AwaitingSubmission'],
  ['AwaitingFee', 'expire', 'Failed'],
  ['AwaitingSubmission', 'recordSubmission', 'AwaitingInclusion'],
  ['AwaitingSubmission', 'recordRejection', 'Failed'],
  ['AwaitingSubmission', 'expire', 'Failed'],
  ['AwaitingInclusion', 'recordSuccess', 'Succeeded'],
  ['AwaitingInclusion', 'recordLedgerFailure', 'Failed'],
  ['AwaitingInclusion', 'expire', 'Failed'],
]

describe('nextState', () => {
  const pairs = MIDNIGHT_TRANSACTION_STATES.flatMap((state) =>
    ACTIONS.map((action): [MidnightTransactionState, TransactionAction] => [state, action]),
  )
  expect(pairs.length).toBeGreaterThan(0)

  test.each(pairs)('%s + %s', (state, action) => {
    const allowed = ALLOWED.find(([from, by]) => from === state && by === action)
    expect(nextState(state, action)).toBe(allowed?.[2])
  })

  test('terminal states allow nothing', () => {
    for (const state of MIDNIGHT_TRANSACTION_TERMINAL_STATES) {
      for (const action of ACTIONS) expect(nextState(state, action)).toBeUndefined()
    }
  })

  test('the expirable states are exactly the non-terminal ones', () => {
    expect([...EXPIRABLE_STATES].sort()).toEqual(
      MIDNIGHT_TRANSACTION_STATES.filter(
        (state) => !MIDNIGHT_TRANSACTION_TERMINAL_STATES.some((terminal) => terminal === state),
      ).sort(),
    )
  })
})

describe('entryState', () => {
  const calls: ReadonlyArray<[string, CommittedCall, MidnightTransactionState]> = [
    ['unproven bytes wait for the proof', { unprovenTx: 'unproven' }, 'AwaitingProof'],
    ['bound bytes wait for the relayer fee', { boundTx: 'bound' }, 'AwaitingFee'],
  ]

  test.each(calls)('%s', (_name, call, state) => {
    expect(entryState(call)).toBe(state)
  })

  test('the table names one entry state per kind of call', () => {
    expect(ENTRY_STATE_BY_CALL).toEqual({ unprovenTx: 'AwaitingProof', boundTx: 'AwaitingFee' })
  })
})

describe('assertConsistent', () => {
  test.each(MIDNIGHT_TRANSACTION_STATES)('%s holds what its state requires', (state) => {
    expect(() => assertConsistent(TRANSACTION_IN_STATE[state])).not.toThrow()
  })

  test('AwaitingSubmission holds a caller-bound call as it holds a backend-proved one', () => {
    expect(() => assertConsistent(CALLER_BOUND_TRANSACTION_AWAITING_SUBMISSION)).not.toThrow()
  })

  const violations: ReadonlyArray<[string, Partial<MidnightTransaction>, string]> = [
    ['AwaitingProof without the unproven bytes', { unprovenTx: null }, 'must have unprovenTx set'],
    ['AwaitingProof without the TTL', { expireTime: null }, 'must have expireTime set'],
    ['AwaitingProof with proven bytes', { unboundTx: 'x' }, 'must have unboundTx unset'],
    ['AwaitingProof with bound bytes', { boundTx: 'x' }, 'must have boundTx unset'],
    [
      'AwaitingWallet still holding the unproven bytes',
      { state: 'AwaitingWallet', unboundTx: 'x' },
      'must have unprovenTx unset',
    ],
    [
      'AwaitingFee without the bound bytes',
      { ...TRANSACTION_IN_STATE.AwaitingFee, boundTx: null },
      'must have boundTx set',
    ],
    [
      'AwaitingFee holding proven bytes',
      { ...TRANSACTION_IN_STATE.AwaitingFee, unboundTx: 'x' },
      'must have unboundTx unset',
    ],
    [
      'AwaitingFee already paid for',
      { ...TRANSACTION_IN_STATE.AwaitingFee, finalizedTx: 'x' },
      'must have finalizedTx unset',
    ],
    [
      'AwaitingSubmission without the paid bytes',
      { ...CALLER_BOUND_TRANSACTION_AWAITING_SUBMISSION, finalizedTx: null },
      'must have finalizedTx set',
    ],
    [
      'AwaitingInclusion without the id',
      { ...TRANSACTION_IN_STATE.AwaitingInclusion, txId: null },
      'must have txId set',
    ],
    [
      'Failed without a reason',
      { ...TRANSACTION_IN_STATE.Failed, failure: null },
      'must have failure set',
    ],
    [
      'Succeeded still holding the unproven bytes',
      { ...TRANSACTION_IN_STATE.Succeeded, unprovenTx: 'x' },
      'must have unprovenTx unset',
    ],
  ]

  test.each(violations)('%s is refused', (_name, overrides, message) => {
    expect(() => assertConsistent(transactionFixture(overrides))).toThrow(message)
  })
})

type MidnightTransaction = ReturnType<typeof transactionFixture>
