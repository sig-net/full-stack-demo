import { ETHEREUM_TRANSACTION_EVENTS } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { EthereumTransactionStateResolver } from '@/lib/ethereum/transaction-v1/transaction-state-resolver'
import { LifecycleEventConsumer } from '@/lib/event/lifecycle-event-consumer'

/** Every transaction lifecycle event is a nudge to resolve the transaction it names. */
export class EthereumTransactionEventConsumer extends LifecycleEventConsumer {
  constructor(stateResolver: EthereumTransactionStateResolver) {
    super({
      resource: 'Ethereum transaction',
      ownEvents: ETHEREUM_TRANSACTION_EVENTS,
      resolve: (name) => stateResolver.resolveTransaction({ name }),
    })
  }
}
