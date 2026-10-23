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
  callerAddress: string,
  args: GetActivityArgs,
): Promise<ActivityResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.activityV1.adaptor.getActivity(
    callerAddress,
    args,
  )
}

export async function listActivities(
  callerAddress: string,
  args: ListActivitiesArgs,
): Promise<ActivityListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.activityV1.adaptor.listActivities(
    callerAddress,
    args,
  )
}
