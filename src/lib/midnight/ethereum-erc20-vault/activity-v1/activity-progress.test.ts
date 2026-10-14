import { describe, expect, test } from 'vitest'

import type {
  Activity,
  ActivityTransaction,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import { activityFixture } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-fixtures'
import {
  type ActivityAction,
  activityActionOf,
  type ActivityStepStatus,
  activityStepsOf,
  DEPOSIT_STEPS,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress'

const WALLET_TRANSACTION = {
  name: `${activityFixture().name.split('/').slice(0, 2).join('/')}/midnight-transactions/11111111-1111-4111-8111-111111111111`,
  circuit: 'startDeposit',
  expireTime: new Date('2026-01-01T01:00:00Z'),
}

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
  return { hash, state, lifecycleState }
}

describe('activityActionOf', () => {
  const cases: { name: string; activity: Partial<Activity>; expected: ActivityAction }[] = [
    {
      name: 'a waiting wallet transaction asks for balancing',
      activity: { walletTransaction: WALLET_TRANSACTION },
      expected: { kind: 'balance', transaction: WALLET_TRANSACTION },
    },
    {
      name: 'a deposit awaiting completion asks for the completion',
      activity: { depositState: 'AwaitingCompletion' },
      expected: { kind: 'complete' },
    },
    {
      name: 'balancing comes before completion when both apply',
      activity: { depositState: 'AwaitingCompletion', walletTransaction: WALLET_TRANSACTION },
      expected: { kind: 'balance', transaction: WALLET_TRANSACTION },
    },
    {
      name: 'the backend at work asks for nothing',
      activity: { depositState: 'AwaitingVaultRequest', vaultRequestState: 'AwaitingSend' },
      expected: { kind: 'none' },
    },
    {
      name: 'a completed deposit asks for nothing',
      activity: { depositState: 'Completed', state: 'Complete', outcome: 'minted' },
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
  const cases: { name: string; activity: Partial<Activity>; expected: string }[] = [
    {
      name: 'a start call being proved stands at the signing step',
      activity: { startTransaction: transaction('AwaitingProof', null) },
      expected: 'cppppppppp',
    },
    {
      name: 'a start call waiting for the wallet stands at the signing step',
      activity: { startTransaction: transaction('AwaitingWallet', null) },
      expected: 'cppppppppp',
    },
    {
      name: 'a submitted start call stands at inclusion',
      activity: { startTransaction: transaction('AwaitingInclusion') },
      expected: 'dcpppppppp',
    },
    {
      name: 'a request awaiting its flush',
      activity: { depositState: 'AwaitingVaultRequest', vaultRequestState: 'AwaitingFlush' },
      expected: 'ddcppppppp',
    },
    {
      name: 'a request awaiting the MPC signature',
      activity: { depositState: 'AwaitingVaultRequest', vaultRequestState: 'AwaitingSignature' },
      expected: 'ddddcppppp',
    },
    {
      name: 'a failed sweep is reported at its step while the request goes on',
      activity: {
        depositState: 'AwaitingVaultRequest',
        vaultRequestState: 'AwaitingBroadcast',
        foreignChainTransaction: transaction('Failed'),
      },
      expected: 'dddddfpppp',
    },
    {
      name: 'an attestation awaiting its flush',
      activity: {
        depositState: 'AwaitingVaultRequest',
        vaultRequestState: 'AwaitingAttestationFlush',
      },
      expected: 'dddddddcpp',
    },
    {
      name: 'a deposit awaiting the user completion',
      activity: { depositState: 'AwaitingCompletion', vaultRequestState: 'Attested' },
      expected: 'ddddddddcp',
    },
    {
      name: 'a complete call submitted stands at its inclusion',
      activity: {
        depositState: 'AwaitingCompleteTransaction',
        vaultRequestState: 'Attested',
        completeTransaction: transaction('AwaitingSubmission'),
      },
      expected: 'dddddddddc',
    },
    {
      name: 'a completed deposit has every step done',
      activity: { depositState: 'Completed', state: 'Complete', outcome: 'minted' },
      expected: 'dddddddddd',
    },
    {
      name: 'a deposit whose start never reached the node failed at signing',
      activity: {
        depositState: 'Failed',
        state: 'Failed',
        startTransaction: transaction('Failed', null),
      },
      expected: 'fppppppppp',
    },
    {
      name: 'a deposit whose start was refused on chain failed at inclusion',
      activity: {
        depositState: 'Failed',
        state: 'Failed',
        startTransaction: transaction('Failed'),
      },
      expected: 'dfpppppppp',
    },
  ]
  test.each(cases)('$name', ({ activity, expected }) => {
    const steps = activityStepsOf(activityFixture(activity))
    expect(steps.map((step) => step.label)).toEqual([...DEPOSIT_STEPS])
    expect(steps.map((step) => letters[step.status]).join('')).toBe(expected)
  })
})
