import { z } from 'zod'

import {
  ETHEREUM_TRANSACTION_TERMINAL_STATES,
  type EthereumTransactionState,
} from '@/lib/ethereum/transaction-v1/transaction'
import { ETHEREUM_TRANSACTION_EVENT_BY_STATE } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { Event, EventDefinition } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'
import { vaultRequestNameSchema } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  VAULT_REQUEST_EVENTS,
  vaultRequestEventDataSchema,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { VaultRequestStateResolver } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-resolver'
import {
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'
import { MIDNIGHT_TRANSACTION_EVENT_BY_STATE } from '@/lib/midnight/transaction-v1/transaction-state-controller'

/**
 * Adapts the event bus to the resolver: every vault request lifecycle event is a nudge to resolve
 * the request it names, and every child transaction's terminal event a nudge to resolve the
 * request it serves. A flush landing reaches the resolver through `resolveWaitingFlushes`, not
 * through an event.
 */
export class VaultRequestEventConsumer implements EventConsumer {
  private readonly stateResolver: VaultRequestStateResolver

  constructor(stateResolver: VaultRequestStateResolver) {
    this.stateResolver = stateResolver
  }

  wantsEvent(event: Event): boolean {
    return isOwnEvent(event) || childParent(event) !== undefined
  }

  async handleEvent(event: Event): Promise<void> {
    if (isOwnEvent(event)) {
      const parsed = vaultRequestEventDataSchema.safeParse(event.data)
      if (!parsed.success) {
        throw new Error(`${event.type} ${event.id} is malformed: ${z.prettifyError(parsed.error)}`)
      }
      await this.stateResolver.resolveVaultRequest({ name: parsed.data.name })
      return
    }
    const parent = childParent(event)
    if (parent === undefined) {
      throw new Error(`${event.type} ${event.id} does not name a vault request`)
    }
    await this.stateResolver.resolveVaultRequest({ name: parent })
  }
}

function isOwnEvent(event: Event): boolean {
  return VAULT_REQUEST_EVENTS.some((definition) => definition.matches(event))
}

/** The vault request a child's terminal event serves, or undefined when the event is not one. */
function childParent(event: Event): string | undefined {
  for (const definition of CHILD_TERMINAL_EVENTS) {
    if (!definition.matches(event)) continue
    const parsed = definition.parse(event)
    if (!parsed.success) return undefined
    return vaultRequestNameSchema.safeParse(parsed.data.parent).success
      ? parsed.data.parent
      : undefined
  }
  return undefined
}

const CHILD_TERMINAL_EVENTS: readonly EventDefinition<{ name: string; parent: string }>[] = [
  ...MIDNIGHT_TRANSACTION_TERMINAL_STATES.map(
    (state: MidnightTransactionState) => MIDNIGHT_TRANSACTION_EVENT_BY_STATE[state],
  ),
  ...ETHEREUM_TRANSACTION_TERMINAL_STATES.map(
    (state: EthereumTransactionState) => ETHEREUM_TRANSACTION_EVENT_BY_STATE[state],
  ),
]
