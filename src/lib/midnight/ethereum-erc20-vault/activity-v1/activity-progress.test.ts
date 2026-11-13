import { describe, expect, test } from 'vitest'

import {
  ACTIVITY_TYPES,
  type ActivityTransaction,
  type DepositActivity,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  activityFixture,
  START_TX_HASH,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-fixtures'
import {
  type ActivityAction,
  activityActionOf,
  type ActivityStepStatus,
  activityStepsOf,
  ACTIVITY_STEPS_BY_TYPE,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress'

function transaction(
  lifecycleState: ActivityTransaction['lifecycleState'],
  hash: string | null = 'aa',
): ActivityTransaction {
  const state =
    lifecycleState === 'Succeeded'
      ? 'Succeeded'
      : lifecycleState === 'Failed'
        ? 'Failed'
        : 'Pending'
  return { hash, blockNumber: null, state, lifecycleState }
}

describe('activityActionOf', () => {
  const cases: { name: string; activity: Partial<DepositActivity>; expected: ActivityAction }[] = [
    {
      name: 'a deposit awaiting completion asks for the completion',
      activity: { resourceState: 'AwaitingCompletion' },
      expected: { kind: 'complete' },
    },
    {
      name: 'the backend at work asks for nothing',
      activity: { resourceState: 'AwaitingVaultRequest', vaultRequestState: 'AwaitingSend' },
      expected: { kind: 'none' },
    },
    {
      name: 'a completed deposit asks for nothing',
      activity: { resourceState: 'Completed', state: 'Complete', outcome: 'minted' },
      expected: { kind: 'none' },
    },
  ]
  test.each(cases)('$name', ({ activity, expected }) => {
    expect(activityActionOf(activityFixture(activity))).toEqual(expected)
  })
})

describe('activityStepsOf', () => {
  /** The statuses as a string of one letter per step: d done, c current, p pending, f failed. */
  const letters: Record<ActivityStepStatus, string> = {
    done: 'd',
    current: 'c',
    pending: 'p',
    failed: 'f',
  }
  const cases: { name: string; activity: Partial<DepositActivity>; expected: string }[] = [
    {
      name: 'a start call the page has not committed stands at the signing step',
      activity: { startTransaction: null },
      expected: 'cppppppppp',
    },
    {
      name: 'a finalised start call awaiting its submission stands at inclusion',
      activity: { startTransaction: transaction('AwaitingSubmission', null) },
      expected: 'dcpppppppp',
    },
    {
      name: 'a submitted start call stands at inclusion',
      activity: { startTransaction: transaction('AwaitingInclusion') },
      expected: 'dcpppppppp',
    },
    {
      name: 'a request awaiting its flush',
      activity: { resourceState: 'AwaitingVaultRequest', vaultRequestState: 'AwaitingFlush' },
      expected: 'ddcppppppp',
    },
    {
      name: 'a request awaiting the MPC signature',
      activity: { resourceState: 'AwaitingVaultRequest', vaultRequestState: 'AwaitingSignature' },
      expected: 'ddddcppppp',
    },
    {
      name: 'a failed sweep is reported at its step while the request goes on',
      activity: {
        resourceState: 'AwaitingVaultRequest',
        vaultRequestState: 'AwaitingBroadcast',
        foreignChainTransaction: transaction('Failed'),
      },
      expected: 'dddddfpppp',
    },
    {
      name: 'an attestation awaiting its flush',
      activity: {
        resourceState: 'AwaitingVaultRequest',
        vaultRequestState: 'AwaitingAttestationFlush',
      },
      expected: 'dddddddcpp',
    },
    {
      name: 'a deposit awaiting the user completion',
      activity: { resourceState: 'AwaitingCompletion', vaultRequestState: 'Attested' },
      expected: 'ddddddddcp',
    },
    {
      name: 'a complete call submitted stands at its inclusion',
      activity: {
        resourceState: 'AwaitingCompleteTransaction',
        vaultRequestState: 'Attested',
        completeTransaction: transaction('AwaitingSubmission'),
      },
      expected: 'dddddddddc',
    },
    {
      name: 'a completed deposit has every step done',
      activity: { resourceState: 'Completed', state: 'Complete', outcome: 'minted' },
      expected: 'dddddddddd',
    },
    {
      name: 'a deposit whose start never reached the node failed at signing',
      activity: {
        resourceState: 'Failed',
        state: 'Failed',
        startTransaction: transaction('Failed', null),
      },
      expected: 'fppppppppp',
    },
    {
      name: 'a deposit whose start was refused on chain failed at inclusion',
      activity: {
        resourceState: 'Failed',
        state: 'Failed',
        startTransaction: transaction('Failed'),
      },
      expected: 'dfpppppppp',
    },
  ]
  test.each(cases)('$name', ({ activity, expected }) => {
    const steps = activityStepsOf(activityFixture(activity))
    expect(steps.map(({ label, signedInPage }) => ({ label, signedInPage }))).toEqual(
      ACTIVITY_STEPS_BY_TYPE.Deposit.map(({ label, signedInPage }) => ({ label, signedInPage })),
    )
    expect(steps.map((step) => letters[step.status]).join('')).toBe(expected)
  })

  test.each(ACTIVITY_TYPES)(
    'a %s has the wallet sign its start and completion in the page',
    (type) => {
      const signed = ACTIVITY_STEPS_BY_TYPE[type].flatMap((step, index) =>
        step.signedInPage ? [index] : [],
      )
      expect(signed).toEqual([0, 8])
    },
  )

  test('reads each reference from the row, null while the step has not assigned it', () => {
    const steps = activityStepsOf(
      activityFixture({
        vaultRequestId: '22'.repeat(32),
        foreignChainTransaction: {
          hash: null,
          blockNumber: null,
          state: 'Pending',
          lifecycleState: 'AwaitingSubmission',
        },
        completeTransaction: null,
      }),
    )
    expect(steps.map((step) => step.reference)).toEqual([
      null,
      { kind: 'midnightTransaction', id: START_TX_HASH, blockNumber: null },
      null,
      { kind: 'vaultRequest', id: '22'.repeat(32), blockNumber: null },
      null,
      { kind: 'ethereumTransaction', id: null, blockNumber: null },
      null,
      null,
      null,
      { kind: 'midnightTransaction', id: null, blockNumber: null },
    ])
  })
})
