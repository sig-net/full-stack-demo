import { describe, expect, test } from 'vitest'

import { activitiesDueForCompletion } from '@/lib/activity/completions-due'
import { activityFixture } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-fixtures'
import { USER_COMMITMENT } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'

const awaiting = activityFixture({
  name: `${activityFixture().name.slice(0, -1)}a`,
  resourceState: 'AwaitingCompletion',
})
const working = activityFixture({ resourceState: 'AwaitingVaultRequest' })
const anotherSecrets = activityFixture({
  name: `${activityFixture().name.slice(0, -1)}b`,
  resourceState: 'AwaitingCompletion',
  userCommitment: '2d'.repeat(32),
})
const RETRY_MS = 30_000

describe('activitiesDueForCompletion', () => {
  test.each([
    {
      name: 'a deposit awaiting completion that was never attempted',
      attempted: new Map<string, number>(),
      now: 1_000_000,
      expected: [awaiting.name],
    },
    {
      name: 'an attempt within the retry window holds it back',
      attempted: new Map([[awaiting.name, 1_000_000 - RETRY_MS + 1]]),
      now: 1_000_000,
      expected: [],
    },
    {
      name: 'an attempt as old as the retry window frees it',
      attempted: new Map([[awaiting.name, 1_000_000 - RETRY_MS]]),
      now: 1_000_000,
      expected: [awaiting.name],
    },
    {
      name: 'a deposit the backend is working on is never due',
      attempted: new Map<string, number>(),
      now: 1_000_000,
      expected: [awaiting.name],
    },
    {
      name: 'a deposit another vault secret started is never due',
      attempted: new Map<string, number>(),
      now: 1_000_000,
      expected: [awaiting.name],
    },
  ])('$name', ({ attempted, now, expected }) => {
    expect(
      activitiesDueForCompletion(
        [working, awaiting, anotherSecrets],
        USER_COMMITMENT,
        attempted,
        now,
        RETRY_MS,
      ).map((a) => a.name),
    ).toEqual(expected)
  })
})
