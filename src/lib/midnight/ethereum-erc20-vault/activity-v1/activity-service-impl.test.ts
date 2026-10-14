import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type {
  Activity,
  DepositActivity,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  activityFixture,
  approvalActivityFixture,
  swapActivityFixture,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-fixtures'
import { ActivityServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service-impl'
import { MemoryRepository } from '@/lib/repository/repository-memory-impl'

const caller: Caller = resolveCaller('ab'.repeat(32))
const stranger: Caller = resolveCaller('cd'.repeat(32))

const deposit = (id: string, overrides: Partial<DepositActivity> = {}): Activity =>
  activityFixture({ name: `${caller.name}/ethereum-erc20-vault-deposits/${id}`, ...overrides })

const mine = [
  deposit('1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b', {
    createTime: new Date('2026-01-01T00:00:00Z'),
  }),
  deposit('2f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b', {
    state: 'Complete',
    createTime: new Date('2026-01-02T00:00:00Z'),
  }),
  swapActivityFixture({
    name: `${caller.name}/ethereum-erc20-vault-swaps/4f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`,
    createTime: new Date('2026-01-03T00:00:00Z'),
  }),
  approvalActivityFixture({
    name: `${caller.name}/ethereum-erc20-vault-approvals/5f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`,
    createTime: new Date('2026-01-04T00:00:00Z'),
  }),
]
const theirs = activityFixture({
  name: `${stranger.name}/ethereum-erc20-vault-deposits/3f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`,
})

async function serviceOver(activities: readonly Activity[]): Promise<ActivityServiceImpl> {
  const repository = new MemoryRepository<Activity>()
  for (const activity of activities) await repository.create(activity)
  return new ActivityServiceImpl(repository)
}

describe('ActivityServiceImpl', () => {
  test("listActivities lists the caller's activities of every type newest first", async () => {
    const service = await serviceOver([...mine, theirs])
    expect(await service.listActivities(caller, {})).toEqual([...mine].reverse())
    expect(await service.listActivities(stranger, {})).toEqual([theirs])
  })

  test('listActivities keeps to the types asked for', async () => {
    const service = await serviceOver([...mine, theirs])
    expect(await service.listActivities(caller, { types: ['Deposit', 'Swap'] })).toEqual([
      mine[2],
      mine[1],
      mine[0],
    ])
    expect(await service.listActivities(caller, { types: ['Approval'] })).toEqual([mine[3]])
  })

  test('getActivity answers only for the owner', async () => {
    const service = await serviceOver([...mine, theirs])
    expect(await service.getActivity(caller, { name: mine[0]?.name ?? '' })).toEqual(mine[0])
    expect(await service.getActivity(caller, { name: theirs.name })).toBeUndefined()
    expect(await service.getActivity(stranger, { name: mine[0]?.name ?? '' })).toBeUndefined()
  })
})
