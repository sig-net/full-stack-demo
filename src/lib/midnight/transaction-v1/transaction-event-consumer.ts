import { z } from 'zod'

import type { Event } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'
import {
  TRANSACTION_EVENTS,
  transactionEventDataSchema,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { TransactionStateResolver } from '@/lib/midnight/transaction-v1/transaction-state-resolver'

/** Adapts the event bus to the resolver: every transaction lifecycle event is a nudge to resolve. */
export class TransactionEventConsumer implements EventConsumer {
  private readonly stateResolver: TransactionStateResolver

  constructor(stateResolver: TransactionStateResolver) {
    this.stateResolver = stateResolver
  }

  wantsEvent(event: Event): boolean {
    return TRANSACTION_EVENTS.some((definition) => definition.matches(event))
  }

  async handleEvent(event: Event): Promise<void> {
    const parsed = transactionEventDataSchema.safeParse(event.data)
    if (!parsed.success) {
      throw new Error(`${event.type} ${event.id} is malformed: ${z.prettifyError(parsed.error)}`)
    }
    await this.stateResolver.resolveTransaction({ name: parsed.data.name })
  }
}
