import { z } from 'zod'

import type { Event } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'
import {
  MIDNIGHT_TRANSACTION_EVENTS,
  midnightTransactionEventDataSchema,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { MidnightTransactionStateResolver } from '@/lib/midnight/transaction-v1/transaction-state-resolver'

/** Adapts the event bus to the resolver: every transaction lifecycle event is a nudge to resolve. */
export class MidnightTransactionEventConsumer implements EventConsumer {
  private readonly stateResolver: MidnightTransactionStateResolver

  constructor(stateResolver: MidnightTransactionStateResolver) {
    this.stateResolver = stateResolver
  }

  wantsEvent(event: Event): boolean {
    return MIDNIGHT_TRANSACTION_EVENTS.some((definition) => definition.matches(event))
  }

  async handleEvent(event: Event): Promise<void> {
    const parsed = midnightTransactionEventDataSchema.safeParse(event.data)
    if (!parsed.success) {
      throw new Error(`${event.type} ${event.id} is malformed: ${z.prettifyError(parsed.error)}`)
    }
    await this.stateResolver.resolveTransaction({ name: parsed.data.name })
  }
}
