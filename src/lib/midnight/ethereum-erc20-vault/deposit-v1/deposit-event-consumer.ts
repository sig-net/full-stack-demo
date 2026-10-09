import { z } from 'zod'

import type { Event, EventDefinition } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'
import { depositNameSchema } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  DEPOSIT_EVENTS,
  depositEventDataSchema,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type { DepositStateResolver } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-resolver'
import {
  VAULT_REQUEST_TERMINAL_STATES,
  type VaultRequestState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import { VAULT_REQUEST_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import {
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'
import { MIDNIGHT_TRANSACTION_EVENT_BY_STATE } from '@/lib/midnight/transaction-v1/transaction-state-controller'

/**
 * Adapts the event bus to the resolver: every deposit lifecycle event is a nudge to resolve the
 * deposit it names, and every child's terminal event (a caller transaction ending, the vault
 * request attested) a nudge to resolve the deposit it serves.
 */
export class DepositEventConsumer implements EventConsumer {
  private readonly stateResolver: DepositStateResolver

  constructor(stateResolver: DepositStateResolver) {
    this.stateResolver = stateResolver
  }

  wantsEvent(event: Event): boolean {
    return isOwnEvent(event) || childParent(event) !== undefined
  }

  async handleEvent(event: Event): Promise<void> {
    if (isOwnEvent(event)) {
      const parsed = depositEventDataSchema.safeParse(event.data)
      if (!parsed.success) {
        throw new Error(`${event.type} ${event.id} is malformed: ${z.prettifyError(parsed.error)}`)
      }
      await this.stateResolver.resolveDeposit({ name: parsed.data.name })
      return
    }
    const parent = childParent(event)
    if (parent === undefined) {
      throw new Error(`${event.type} ${event.id} does not name a deposit`)
    }
    await this.stateResolver.resolveDeposit({ name: parent })
  }
}

function isOwnEvent(event: Event): boolean {
  return DEPOSIT_EVENTS.some((definition) => definition.matches(event))
}

/** The deposit a child's terminal event serves, or undefined when the event is not one. */
function childParent(event: Event): string | undefined {
  for (const definition of CHILD_TERMINAL_EVENTS) {
    if (!definition.matches(event)) continue
    const parsed = definition.parse(event)
    if (!parsed.success) return undefined
    return depositNameSchema.safeParse(parsed.data.parent).success ? parsed.data.parent : undefined
  }
  return undefined
}

const CHILD_TERMINAL_EVENTS: readonly EventDefinition<{ name: string; parent: string }>[] = [
  ...MIDNIGHT_TRANSACTION_TERMINAL_STATES.map(
    (state: MidnightTransactionState) => MIDNIGHT_TRANSACTION_EVENT_BY_STATE[state],
  ),
  ...VAULT_REQUEST_TERMINAL_STATES.map(
    (state: VaultRequestState) => VAULT_REQUEST_EVENT_BY_STATE[state],
  ),
]
