import type { Activity } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import { activityActionOf } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress'

/**
 * The activities whose completion the browser should start now: those awaiting it that have
 * not been attempted within `retryAfterMs`, so a refusal or a lost answer is retried on a later
 * refresh and a page that polls every few seconds never calls the server twice for one row.
 */
export function activitiesDueForCompletion(
  activities: readonly Activity[],
  attemptedAt: ReadonlyMap<string, number>,
  now: number,
  retryAfterMs: number,
): Activity[] {
  return activities.filter((activity) => {
    if (activityActionOf(activity).kind !== 'complete') return false
    const attempted = attemptedAt.get(activity.name)
    return attempted === undefined || now - attempted >= retryAfterMs
  })
}
