import { describe, expect, test } from 'vitest'

import {
  type Deposit,
  DEPOSIT_STATES,
  DEPOSIT_TERMINAL_STATES,
  type DepositState,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  DEPOSIT_IN_STATE,
  depositFixture,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import {
  assertConsistent,
  COMMITTABLE_STATES,
  type DepositStateAction,
  nextState,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-machine'

const ACTIONS: readonly DepositStateAction[] = [
  'recordStarted',
  'recordStartFailure',
  'recordAttested',
  'complete',
  'recordCompleted',
  'recordCompleteFailure',
]

/** Every allowed transition. Any pair not listed here must be refused. */
const ALLOWED: ReadonlyArray<[DepositState, DepositStateAction, DepositState]> = [
  ['AwaitingStartTransaction', 'recordStarted', 'AwaitingVaultRequest'],
  ['AwaitingStartTransaction', 'recordStartFailure', 'Failed'],
  ['AwaitingVaultRequest', 'recordAttested', 'AwaitingCompletion'],
  ['AwaitingCompletion', 'complete', 'AwaitingCompleteTransaction'],
  ['AwaitingCompleteTransaction', 'recordCompleted', 'Completed'],
  ['AwaitingCompleteTransaction', 'recordCompleteFailure', 'AwaitingCompletion'],
]

describe('nextState', () => {
  const pairs = DEPOSIT_STATES.flatMap((state) =>
    ACTIONS.map((action): [DepositState, DepositStateAction] => [state, action]),
  )
  expect(pairs.length).toBeGreaterThan(0)

  test.each(pairs)('%s + %s', (state, action) => {
    const allowed = ALLOWED.find(([from, by]) => from === state && by === action)
    expect(nextState(state, action)).toBe(allowed?.[2])
  })

  test('each action is legal from exactly one state', () => {
    for (const action of ACTIONS) {
      expect(ALLOWED.filter(([, by]) => by === action)).toHaveLength(1)
    }
  })

  test('terminal states allow nothing', () => {
    for (const state of DEPOSIT_TERMINAL_STATES) {
      for (const action of ACTIONS) expect(nextState(state, action)).toBeUndefined()
    }
  })

  test('a deposit is started waiting for its start transaction', () => {
    expect(COMMITTABLE_STATES).toEqual(['AwaitingStartTransaction'])
  })
})

describe('assertConsistent', () => {
  test.each(DEPOSIT_STATES)('%s holds what its state requires', (state) => {
    expect(() => assertConsistent(DEPOSIT_IN_STATE[state])).not.toThrow()
  })

  const violations: ReadonlyArray<[string, Partial<Deposit>, string]> = [
    ['a waiting deposit with an outcome', { outcome: 'minted' }, 'must have outcome unset'],
    ['a waiting deposit with a failure', { failure: 'StartFailed' }, 'must have failure unset'],
    ['a waiting deposit with an error', { error: 'boom' }, 'must have error unset'],
    [
      'Completed without an outcome',
      { ...DEPOSIT_IN_STATE.Completed, outcome: null },
      'must have outcome set',
    ],
    [
      'Completed with a failure',
      { ...DEPOSIT_IN_STATE.Completed, failure: 'StartFailed' },
      'must have failure unset',
    ],
    [
      'Failed without a failure',
      { ...DEPOSIT_IN_STATE.Failed, failure: null },
      'must have failure set',
    ],
    [
      'Failed with an outcome',
      { ...DEPOSIT_IN_STATE.Failed, outcome: 'closed' },
      'must have outcome unset',
    ],
  ]

  test.each(violations)('%s is refused', (_name, overrides, message) => {
    expect(() => assertConsistent(depositFixture(overrides))).toThrow(message)
  })

  test('Failed without a message is a held failure', () => {
    expect(() => assertConsistent({ ...DEPOSIT_IN_STATE.Failed, error: null })).not.toThrow()
  })
})
