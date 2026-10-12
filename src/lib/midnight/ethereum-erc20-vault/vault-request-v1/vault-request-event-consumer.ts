import {
  ETHEREUM_TRANSACTION_TERMINAL_STATES,
  type EthereumTransactionState,
} from '@/lib/ethereum/transaction-v1/transaction'
import { ETHEREUM_TRANSACTION_EVENT_BY_STATE } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import type { EventDefinition } from '@/lib/event/event'
import { LifecycleEventConsumer } from '@/lib/event/lifecycle-event-consumer'
import { vaultRequestNameSchema } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import { VAULT_REQUEST_EVENTS } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { VaultRequestStateResolver } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-resolver'
import {
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
  type MidnightTransactionState,
} from '@/lib/midnight/transaction-v1/transaction'
import { MIDNIGHT_TRANSACTION_EVENT_BY_STATE } from '@/lib/midnight/transaction-v1/transaction-state-controller'

/**
 * Every vault request lifecycle event is a nudge to resolve the request it names, and every
 * child transaction's terminal event a nudge to resolve the request it serves. A flush landing
 * reaches the resolver through `resolveWaitingFlushes`, not through an event.
 */
export class VaultRequestEventConsumer extends LifecycleEventConsumer {
  constructor(stateResolver: VaultRequestStateResolver) {
    super({
      resource: 'vault request',
      ownEvents: VAULT_REQUEST_EVENTS,
      children: { terminalEvents: CHILD_TERMINAL_EVENTS, parentNameSchema: vaultRequestNameSchema },
      resolve: (name) => stateResolver.resolveVaultRequest({ name }),
    })
  }
}

const CHILD_TERMINAL_EVENTS: readonly EventDefinition<{ name: string; parent: string }>[] = [
  ...MIDNIGHT_TRANSACTION_TERMINAL_STATES.map(
    (state: MidnightTransactionState) => MIDNIGHT_TRANSACTION_EVENT_BY_STATE[state],
  ),
  ...ETHEREUM_TRANSACTION_TERMINAL_STATES.map(
    (state: EthereumTransactionState) => ETHEREUM_TRANSACTION_EVENT_BY_STATE[state],
  ),
]
