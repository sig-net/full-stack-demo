import { LifecycleEventConsumer } from '@/lib/event/lifecycle-event-consumer'
import { MIDNIGHT_TRANSACTION_EVENTS } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { MidnightTransactionStateResolver } from '@/lib/midnight/transaction-v1/transaction-state-resolver'
import type { Logger } from '@/lib/logging/logger'

/** Every transaction lifecycle event is a nudge to resolve the transaction it names. */
export class MidnightTransactionEventConsumer extends LifecycleEventConsumer {
  constructor(stateResolver: MidnightTransactionStateResolver, logger: Logger) {
    super({
      logger,
      resource: 'Midnight transaction',
      ownEvents: MIDNIGHT_TRANSACTION_EVENTS,
      resolve: (name) => stateResolver.resolveTransaction({ name }),
    })
  }
}
