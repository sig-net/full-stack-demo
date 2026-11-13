import { describe, expect, test } from 'vitest'

import { CALLER_CREDENTIAL, FIXTURE_NETWORK_ID } from '@/lib/caller/caller-fixtures'
import { activityFixture } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-fixtures'
import type { ActivityService } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service'
import { ActivityServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service-adaptor'
import { DEPOSIT_NAME } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const activity = activityFixture()

function adaptorOver(service: Partial<ActivityService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new ActivityServiceAdaptor(
    mock<ActivityService>('ActivityService', {
      getActivity: recording(activity),
      listActivities: recording([activity]),
      ...service,
    }),
    FIXTURE_NETWORK_ID,
    new RecordingLogger(),
  )
}

describe('ActivityServiceAdaptor', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: ActivityServiceAdaptor) => Promise<{ ok: boolean }>
    service?: Partial<ActivityService>
    expectReceived: object[]
    expectResult: object
  }> = [
    {
      name: 'getActivity hands the parsed name to the service and returns the activity',
      call: (a) => a.getActivity(CALLER_CREDENTIAL, { name: DEPOSIT_NAME }),
      expectReceived: [{ name: DEPOSIT_NAME }],
      expectResult: { ok: true, activity },
    },
    {
      name: 'getActivity refuses a name that is not a deposit',
      call: (a) => a.getActivity(CALLER_CREDENTIAL, { name: 'deposits/1' }),
      expectReceived: [],
      expectResult: { ok: false },
    },
    {
      name: 'getActivity reports an activity the service has no row for',
      call: (a) => a.getActivity(CALLER_CREDENTIAL, { name: DEPOSIT_NAME }),
      service: { getActivity: async () => undefined },
      expectReceived: [],
      expectResult: { ok: false, error: `${DEPOSIT_NAME} was not found.` },
    },
    {
      name: 'listActivities takes no arguments and returns the list',
      call: (a) => a.listActivities(CALLER_CREDENTIAL, {}),
      expectReceived: [{}],
      expectResult: { ok: true, activities: [activity] },
    },
    {
      name: 'listActivities refuses arguments that are not an object',
      call: (a) => a.listActivities(CALLER_CREDENTIAL, 'all'),
      expectReceived: [],
      expectResult: { ok: false },
    },
  ]

  test.each(cases)('$name', async ({ call, service, expectReceived, expectResult }) => {
    const received: object[] = []
    expect(await call(adaptorOver(service ?? {}, received))).toMatchObject(expectResult)
    expect(received).toEqual(expectReceived)
  })
})
