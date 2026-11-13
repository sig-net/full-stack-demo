'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
  credential: LoginCredential,
  args: GetActivityArgs,
): Promise<ActivityResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.activityV1.adaptor.getActivity(
    credential,
    args,
  )
}

export async function listActivities(
  credential: LoginCredential,
  args: ListActivitiesArgs,
): Promise<ActivityListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.activityV1.adaptor.listActivities(
    credential,
    args,
  )
}
