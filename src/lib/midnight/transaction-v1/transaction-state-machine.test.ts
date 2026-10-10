import { describe, expect, test } from 'vitest'

import {
  MIDNIGHT_TRANSACTION_STATES,
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'
import {
  TRANSACTION_IN_STATE,
  transactionFixture,
} from '@/lib/midnight/transaction-v1/transaction-fixtures'
import {
  assertConsistent,
  COMMITTABLE_STATES,
  EXPIRABLE_STATES,
  nextState,
  type TransactionAction,
} from '@/lib/midnight/transaction-v1/transaction-state-machine'

const ACTIONS: readonly TransactionAction[] = [
  'recordProof',
  'recordProofFailure',
  'submit',
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

  test('a transaction can only be stored before or after proving', () => {
    expect(COMMITTABLE_STATES).toEqual(['AwaitingProof', 'AwaitingWallet'])
  })
})

describe('assertConsistent', () => {
  test.each(MIDNIGHT_TRANSACTION_STATES)('%s holds what its state requires', (state) => {
    expect(() => assertConsistent(TRANSACTION_IN_STATE[state])).not.toThrow()
  })

  const violations: ReadonlyArray<[string, Partial<MidnightTransaction>, string]> = [
    ['AwaitingProof without the unproven bytes', { unprovenTx: null }, 'must have unprovenTx set'],
    ['AwaitingProof without the TTL', { expireTime: null }, 'must have expireTime set'],
    ['AwaitingProof with proven bytes', { unboundTx: 'x' }, 'must have unboundTx unset'],
    [
      'AwaitingWallet still holding the unproven bytes',
      { state: 'AwaitingWallet', unboundTx: 'x' },
      'must have unprovenTx unset',
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
