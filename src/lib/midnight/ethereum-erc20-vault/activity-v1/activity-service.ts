import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Activity,
  activityNameSchema,
  activityTypeSchema,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'

/** What the caller's browser reads of its own vault activity. Every method is a read on the view. */
export interface ActivityService {
  /** The caller's activities, newest first, of the types asked for or of every type. */
  listActivities(caller: Caller, args: ListActivitiesArgs): Promise<Activity[]>
  getActivity(caller: Caller, args: GetActivityArgs): Promise<Activity | undefined>
}

export const listActivitiesArgsSchema = z.object({
  types: z.array(activityTypeSchema).nonempty().optional(),
})
export type ListActivitiesArgs = z.infer<typeof listActivitiesArgsSchema>

export const getActivityArgsSchema = z.object({
  name: activityNameSchema,
})
export type GetActivityArgs = z.infer<typeof getActivityArgsSchema>
