import { z } from 'zod'

import {
  ETHEREUM_TRANSACTION_EVENTS,
  ethereumTransactionEventDataSchema,
} from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { EthereumTransactionStateResolver } from '@/lib/ethereum/transaction-v1/transaction-state-resolver'
import type { Event } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'

/** Adapts the event bus to the resolver: every transaction lifecycle event is a nudge to resolve. */
export class EthereumTransactionEventConsumer implements EventConsumer {
  private readonly stateResolver: EthereumTransactionStateResolver

  constructor(stateResolver: EthereumTransactionStateResolver) {
    this.stateResolver = stateResolver
  }

  wantsEvent(event: Event): boolean {
    return ETHEREUM_TRANSACTION_EVENTS.some((definition) => definition.matches(event))
  }

  async handleEvent(event: Event): Promise<void> {
    const parsed = ethereumTransactionEventDataSchema.safeParse(event.data)
    if (!parsed.success) {
      throw new Error(`${event.type} ${event.id} is malformed: ${z.prettifyError(parsed.error)}`)
    }
    await this.stateResolver.resolveTransaction({ name: parsed.data.name })
  }
}
