'use server'

import type {
  GetActivityArgs,
  ListActivitiesArgs,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service'
import type {
  ActivityListResult,
  ActivityResult,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service-adaptor'
import { getBackend } from '@/server/backend'

export async function getActivity(
  callerSecret: string,
  args: GetActivityArgs,
): Promise<ActivityResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.activityV1.adaptor.getActivity(
    callerSecret,
    args,
  )
}

export async function listActivities(
  callerSecret: string,
  args: ListActivitiesArgs,
): Promise<ActivityListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.activityV1.adaptor.listActivities(
    callerSecret,
    args,
  )
}
