import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { Activity } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  type ActivityService,
  getActivityArgsSchema,
  listActivitiesArgsSchema,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service'

/** Adapts the activity service to the wire: the caller secret stands in for the caller, and the arguments are untrusted until parsed. */
export class ActivityServiceAdaptor {
  private readonly activityService: ActivityService

  constructor(activityService: ActivityService) {
    this.activityService = activityService
  }

  async getActivity(callerSecret: string, args: unknown): Promise<ActivityResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = getActivityArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const activity = await this.activityService.getActivity(caller, parsed.data)
    if (activity === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, activity }
  }

  async listActivities(callerSecret: string, args: unknown): Promise<ActivityListResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = listActivitiesArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, activities: await this.activityService.listActivities(caller, parsed.data) }
  }
}

export type ActivityResult =
  | { readonly ok: true; readonly activity: Activity }
  | { readonly ok: false; readonly error: string }

export type ActivityListResult =
  | { readonly ok: true; readonly activities: Activity[] }
  | { readonly ok: false; readonly error: string }
