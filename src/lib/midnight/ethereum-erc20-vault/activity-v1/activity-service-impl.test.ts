import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import type { Caller } from '@/lib/caller/caller'
import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { Activity } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import { activityFixture } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-fixtures'
import { ActivityServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service-impl'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import { MemoryRepository } from '@/lib/repository/repository-memory-impl'

/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET: MidnightSignetConfig = {
  contractAddress: '11'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'22'.repeat(32)}`, false),
}
const VAULT: MidnightEthereumErc20VaultConfig = { contractAddress: '33'.repeat(32) }

const caller: Caller = resolveCaller('ab'.repeat(32))
const stranger: Caller = resolveCaller('cd'.repeat(32))

const own = (id: string, overrides: Partial<Activity> = {}): Activity =>
  activityFixture({
    name: `${caller.name}/ethereum-erc20-vault-deposits/${id}`,
    depositAccount: depositAccountOf(caller, SIGNET, VAULT),
    ...overrides,
  })

const mine = [
  own('1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b', { createTime: new Date('2026-01-01T00:00:00Z') }),
  own('2f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b', {
    state: 'Complete',
    createTime: new Date('2026-01-02T00:00:00Z'),
  }),
]
const theirs = activityFixture({
  name: `${stranger.name}/ethereum-erc20-vault-deposits/3f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`,
  depositAccount: depositAccountOf(stranger, SIGNET, VAULT),
})

async function serviceOver(activities: readonly Activity[]): Promise<ActivityServiceImpl> {
  const repository = new MemoryRepository<Activity>()
  for (const activity of activities) await repository.create(activity)
  return new ActivityServiceImpl(repository, SIGNET, VAULT)
}

describe('ActivityServiceImpl', () => {
  test("listActivities lists the caller's activities newest first", async () => {
    const service = await serviceOver([...mine, theirs])
    expect(await service.listActivities(caller, {})).toEqual([mine[1], mine[0]])
    expect(await service.listActivities(stranger, {})).toEqual([theirs])
  })

  test('getActivity answers only for the owner', async () => {
    const service = await serviceOver([...mine, theirs])
    expect(await service.getActivity(caller, { name: mine[0]?.name ?? '' })).toEqual(mine[0])
    expect(await service.getActivity(caller, { name: theirs.name })).toBeUndefined()
    expect(await service.getActivity(stranger, { name: mine[0]?.name ?? '' })).toBeUndefined()
  })
})
