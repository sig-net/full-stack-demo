import { z } from 'zod'

import type { Event } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'
import type { Flusher } from '@/lib/midnight/ethereum-erc20-vault/flusher'
import {
  VAULT_REQUEST_EVENT_BY_STATE,
  vaultRequestEventDataSchema,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'

/**
 * Adapts the event bus to the flusher: a request entering a state that waits for a flush is a
 * nudge to flush. The handler returns before the flush runs, since a run takes minutes and the
 * hub holds every consumer behind a handler. A run that fails is logged and the sweep flushes again.
 */
export class FlushEventConsumer implements EventConsumer {
  private readonly flusher: Flusher

  constructor(flusher: Flusher) {
    this.flusher = flusher
  }

  wantsEvent(event: Event): boolean {
    return FLUSH_EVENTS.some((definition) => definition.matches(event))
  }

  async handleEvent(event: Event): Promise<void> {
    const parsed = vaultRequestEventDataSchema.safeParse(event.data)
    if (!parsed.success) {
      throw new Error(`${event.type} ${event.id} is malformed: ${z.prettifyError(parsed.error)}`)
    }
    this.flusher.flush().catch((error: unknown) => {
      console.error(`Flush nudged by ${event.type} ${event.id} failed`, error)
    })
  }
}

const FLUSH_EVENTS = [
  VAULT_REQUEST_EVENT_BY_STATE.AwaitingFlush,
  VAULT_REQUEST_EVENT_BY_STATE.AwaitingAttestationFlush,
]
