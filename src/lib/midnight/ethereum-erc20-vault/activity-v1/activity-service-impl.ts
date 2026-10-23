import 'server-only'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { Activity } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { ActivityRepository } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-repository'
import type {
  ActivityService,
  GetActivityArgs,
  ListActivitiesArgs,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service'

export class ActivityServiceImpl implements ActivityService {
  private readonly activityRepository: ActivityRepository

  constructor(activityRepository: ActivityRepository) {
    this.activityRepository = activityRepository
  }

  /** Every activity of a caller is named under the caller, which stands in for it in the search. */
  async listActivities(caller: Caller, { types }: ListActivitiesArgs): Promise<Activity[]> {
    const activities = await this.activityRepository.search({
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller.name}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
    return types === undefined
      ? activities
      : activities.filter((activity) => types.includes(activity.type))
  }

  async getActivity(caller: Caller, args: GetActivityArgs): Promise<Activity | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.activityRepository.get(args.name)
  }
}
