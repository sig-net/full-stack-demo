import { CallerOperationEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-event-consumer'
import { supplyNameSchema } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import { SUPPLY_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
import type { SupplyStateResolver } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-resolver'
import type { Logger } from '@/lib/logging/logger'

export class SupplyEventConsumer extends CallerOperationEventConsumer {
  constructor(stateResolver: SupplyStateResolver, logger: Logger) {
    super({
      logger,
      resource: 'supply',
      events: SUPPLY_EVENT_BY_STATE,
      nameSchema: supplyNameSchema,
      resolve: (name) => stateResolver.resolveSupply({ name }),
    })
  }
}
