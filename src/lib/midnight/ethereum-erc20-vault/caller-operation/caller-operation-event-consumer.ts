import type { z } from 'zod'

import type { EventDefinition } from '@/lib/event/event'
import { LifecycleEventConsumer } from '@/lib/event/lifecycle-event-consumer'
import type { Logger } from '@/lib/logging/logger'
import type { CallerOperationEvents } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
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
 * Every lifecycle event of the operation is a nudge to resolve the operation it names, and every
 * child's terminal event (a caller transaction ending, the vault request attested) a nudge to
 * resolve the operation it serves.
 */
export class CallerOperationEventConsumer extends LifecycleEventConsumer {
  constructor(config: CallerOperationEventConsumerConfig) {
    super({
      logger: config.logger,
      resource: config.resource,
      ownEvents: Object.values(config.events),
      children: { terminalEvents: CHILD_TERMINAL_EVENTS, parentNameSchema: config.nameSchema },
      resolve: config.resolve,
    })
  }
}

export interface CallerOperationEventConsumerConfig {
  /** What the resource is called in the error for a child event that serves another resource. */
  readonly resource: string
  readonly events: CallerOperationEvents
  readonly nameSchema: z.ZodType<string>
  readonly resolve: (name: string) => Promise<void>
  readonly logger: Logger
}

const CHILD_TERMINAL_EVENTS: readonly EventDefinition<{ name: string; parent: string }>[] = [
  ...MIDNIGHT_TRANSACTION_TERMINAL_STATES.map(
    (state: MidnightTransactionState) => MIDNIGHT_TRANSACTION_EVENT_BY_STATE[state],
  ),
  ...VAULT_REQUEST_TERMINAL_STATES.map(
    (state: VaultRequestState) => VAULT_REQUEST_EVENT_BY_STATE[state],
  ),
]
