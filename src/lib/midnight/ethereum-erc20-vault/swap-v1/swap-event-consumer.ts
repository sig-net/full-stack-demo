import { CallerOperationEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-event-consumer'
import { swapNameSchema } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import { SWAP_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-controller'
import type { SwapStateResolver } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-resolver'
import type { Logger } from '@/lib/logging/logger'

export class SwapEventConsumer extends CallerOperationEventConsumer {
  constructor(stateResolver: SwapStateResolver, logger: Logger) {
    super({
      logger,
      resource: 'swap',
      events: SWAP_EVENT_BY_STATE,
      nameSchema: swapNameSchema,
      resolve: (name) => stateResolver.resolveSwap({ name }),
    })
  }
}
