import type { Activity } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { ReadRepository } from '@/lib/repository/repository'

/** The view's repository: the database derives its rows, so it has the reading half alone. */
export type ActivityRepository = ReadRepository<Activity>
