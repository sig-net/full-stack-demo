import 'server-only'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { Activity } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { ActivityRepository } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-repository'
import type {
  ActivityService,
  GetActivityArgs,
  ListActivitiesArgs,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-service'
import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'

export class ActivityServiceImpl implements ActivityService {
  private readonly activityRepository: ActivityRepository
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    activityRepository: ActivityRepository,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.activityRepository = activityRepository
    this.signet = signet
    this.vault = vault
  }

  /** Every activity of a caller shares the deposit account, which stands in for the caller in the search. */
  async listActivities(caller: Caller, _args: ListActivitiesArgs): Promise<Activity[]> {
    return this.activityRepository.search({
      criteria: [
        {
          type: 'exact-text',
          field: 'depositAccount',
          text: depositAccountOf(caller, this.signet, this.vault),
        },
      ],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  async getActivity(caller: Caller, args: GetActivityArgs): Promise<Activity | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.activityRepository.get(args.name)
  }
}
