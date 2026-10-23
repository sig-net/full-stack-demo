import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import type { Activity } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  type ActivityService,
  getActivityArgsSchema,
  listActivitiesArgsSchema,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service'
import type { Logger } from '@/lib/logging/logger'

/** Adapts the activity service to the wire: the caller address stands in for the caller, and the arguments are untrusted until parsed. */
export class ActivityServiceAdaptor {
  private readonly activityService: ActivityService
  private readonly networkId: MidnightNetworkId
  private readonly logger: Logger

  constructor(activityService: ActivityService, networkId: MidnightNetworkId, logger: Logger) {
    this.activityService = activityService
    this.networkId = networkId
    this.logger = logger
  }

  async getActivity(callerAddress: string, args: unknown): Promise<ActivityResult> {
    const caller = resolveCaller(callerAddress, this.networkId)
    this.logger.debug('method called', { method: 'getActivity', caller: caller.name })
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

  async listActivities(callerAddress: string, args: unknown): Promise<ActivityListResult> {
    const caller = resolveCaller(callerAddress, this.networkId)
    this.logger.debug('method called', { method: 'listActivities', caller: caller.name })
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
