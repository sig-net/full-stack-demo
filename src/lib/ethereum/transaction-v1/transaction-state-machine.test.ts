import { describe, expect, test } from 'vitest'

import {
  ETHEREUM_TRANSACTION_STATES,
  ETHEREUM_TRANSACTION_TERMINAL_STATES,
  type EthereumTransactionState,
} from '@/lib/ethereum/transaction-v1/transaction'
import {
  TRANSACTION_IN_STATE,
  transactionFixture,
  TX_HASH,
} from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import {
  assertConsistent,
  COMMITTABLE_STATES,
  EXPIRABLE_STATES,
  nextState,
  type TransactionAction,
} from '@/lib/ethereum/transaction-v1/transaction-state-machine'

const ACTIONS: readonly TransactionAction[] = [
  'recordSubmission',
  'recordRejection',
  'recordSuccess',
  'recordFailure',
  'expire',
]

/** Every allowed transition. Any pair not listed here must be refused. */
const ALLOWED: ReadonlyArray<
  [EthereumTransactionState, TransactionAction, EthereumTransactionState]
> = [
  ['AwaitingSubmission', 'recordSubmission', 'AwaitingInclusion'],
  ['AwaitingSubmission', 'recordRejection', 'Failed'],
  ['AwaitingSubmission', 'expire', 'Failed'],
  ['AwaitingInclusion', 'recordSuccess', 'Succeeded'],
  ['AwaitingInclusion', 'recordFailure', 'Failed'],
  ['AwaitingInclusion', 'expire', 'Failed'],
]

describe('nextState', () => {
  const pairs = ETHEREUM_TRANSACTION_STATES.flatMap((state) =>
    ACTIONS.map((action): [EthereumTransactionState, TransactionAction] => [state, action]),
  )
  expect(pairs.length).toBeGreaterThan(0)

  test.each(pairs)('%s + %s', (state, action) => {
    const allowed = ALLOWED.find(([from, by]) => from === state && by === action)
    expect(nextState(state, action)).toBe(allowed?.[2])
  })

  test('terminal states allow nothing', () => {
    for (const state of ETHEREUM_TRANSACTION_TERMINAL_STATES) {
      for (const action of ACTIONS) expect(nextState(state, action)).toBeUndefined()
    }
  })

  test('the expirable states are exactly the non-terminal ones', () => {
    expect([...EXPIRABLE_STATES].sort()).toEqual(
      ETHEREUM_TRANSACTION_STATES.filter(
        (state) => !ETHEREUM_TRANSACTION_TERMINAL_STATES.some((terminal) => terminal === state),
      ).sort(),
    )
  })

  test('a transaction can only be stored before it is sent', () => {
    expect(COMMITTABLE_STATES).toEqual(['AwaitingSubmission'])
  })
})

describe('assertConsistent', () => {
  test.each(ETHEREUM_TRANSACTION_STATES)('%s holds what its state requires', (state) => {
    expect(() => assertConsistent(TRANSACTION_IN_STATE[state])).not.toThrow()
  })

  test('Failed as Reverted keeps the block that included the transaction', () => {
    expect(() =>
      assertConsistent(
        transactionFixture({
          state: 'Failed',
          txHash: TX_HASH,
          blockNumber: 100n,
          failure: 'Reverted',
        }),
      ),
    ).not.toThrow()
  })

  const violations: ReadonlyArray<[string, Partial<EthereumTransaction>, string]> = [
    ['AwaitingSubmission with a hash', { txHash: TX_HASH }, 'must have txHash unset'],
    ['AwaitingSubmission with a failure', { failure: 'Rejected' }, 'must have failure unset'],
    ['AwaitingInclusion without the hash', { state: 'AwaitingInclusion' }, 'must have txHash set'],
    [
      'AwaitingInclusion with a block',
      { ...TRANSACTION_IN_STATE.AwaitingInclusion, blockNumber: 1n },
      'must have blockNumber unset',
    ],
    [
      'Succeeded without the block',
      { ...TRANSACTION_IN_STATE.Succeeded, blockNumber: null },
      'must have blockNumber set',
    ],
    [
      'Succeeded with an error',
      { ...TRANSACTION_IN_STATE.Succeeded, error: 'x' },
      'must have error unset',
    ],
    [
      'Failed without a reason',
      { ...TRANSACTION_IN_STATE.Failed, failure: null },
      'must have failure set',
    ],
  ]

  test.each(violations)('%s is refused', (_name, overrides, message) => {
    expect(() => assertConsistent(transactionFixture(overrides))).toThrow(message)
  })
})

type EthereumTransaction = ReturnType<typeof transactionFixture>
