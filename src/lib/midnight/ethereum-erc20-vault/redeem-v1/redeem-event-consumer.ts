import { CallerOperationEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-event-consumer'
import { redeemNameSchema } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import { REDEEM_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-controller'
import type { RedeemStateResolver } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-resolver'
import type { Logger } from '@/lib/logging/logger'

export class RedeemEventConsumer extends CallerOperationEventConsumer {
  constructor(stateResolver: RedeemStateResolver, logger: Logger) {
    super({
      logger,
      resource: 'redeem',
      events: REDEEM_EVENT_BY_STATE,
      nameSchema: redeemNameSchema,
      resolve: (name) => stateResolver.resolveRedeem({ name }),
    })
  }
}
