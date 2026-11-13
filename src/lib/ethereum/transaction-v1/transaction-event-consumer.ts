import { ETHEREUM_TRANSACTION_EVENTS } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { EthereumTransactionStateResolver } from '@/lib/ethereum/transaction-v1/transaction-state-resolver'
import { LifecycleEventConsumer } from '@/lib/event/lifecycle-event-consumer'
import type { Logger } from '@/lib/logging/logger'

/** Every transaction lifecycle event is a nudge to resolve the transaction it names. */
export class EthereumTransactionEventConsumer extends LifecycleEventConsumer {
  constructor(stateResolver: EthereumTransactionStateResolver, logger: Logger) {
    super({
      logger,
      resource: 'Ethereum transaction',
      ownEvents: ETHEREUM_TRANSACTION_EVENTS,
      resolve: (name) => stateResolver.resolveTransaction({ name }),
    })
  }
}
