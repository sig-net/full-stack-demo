import { describe, expect, test } from 'vitest'

import {
  type Activity,
  type ActivityTransaction,
  latestTransactionOf,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  activityFixture,
  COMPLETE_TX_HASH,
  FOREIGN_TX_HASH,
  START_TX_HASH,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-fixtures'

const start: ActivityTransaction = { hash: START_TX_HASH, state: 'Succeeded' }
const foreign: ActivityTransaction = { hash: FOREIGN_TX_HASH, state: 'Succeeded' }
const complete: ActivityTransaction = { hash: COMPLETE_TX_HASH, state: 'Pending' }

const cases: ReadonlyArray<{
  name: string
  activity: Partial<Activity>
  expect: ActivityTransaction | null
}> = [
  {
    name: 'nothing submitted yet',
    activity: { startTransaction: null },
    expect: null,
  },
  { name: 'the start call alone', activity: { startTransaction: start }, expect: start },
  {
    name: 'the foreign chain transaction over the start call',
    activity: { startTransaction: start, foreignChainTransaction: foreign },
    expect: foreign,
  },
  {
    name: 'the complete call over both, even while it has no hash yet',
    activity: {
      startTransaction: start,
      foreignChainTransaction: foreign,
      completeTransaction: { hash: null, state: 'Pending' },
    },
    expect: { hash: null, state: 'Pending' },
  },
  {
    name: 'the complete call once it has a hash',
    activity: {
      startTransaction: start,
      foreignChainTransaction: foreign,
      completeTransaction: complete,
    },
    expect: complete,
  },
]

describe('latestTransactionOf', () => {
  test.each(cases)('$name', ({ activity, expect: expected }) => {
    expect(latestTransactionOf(activityFixture(activity))).toEqual(expected)
  })
})
