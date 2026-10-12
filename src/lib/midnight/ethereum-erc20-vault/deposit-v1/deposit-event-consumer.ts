import type { EventDefinition } from '@/lib/event/event'
import { LifecycleEventConsumer } from '@/lib/event/lifecycle-event-consumer'
import { depositNameSchema } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { DEPOSIT_EVENTS } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
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
 * Every deposit lifecycle event is a nudge to resolve the deposit it names, and every child's
 * terminal event (a caller transaction ending, the vault request attested) a nudge to resolve
 * the deposit it serves.
 */
export class DepositEventConsumer extends LifecycleEventConsumer {
  constructor(stateResolver: DepositStateResolver) {
    super({
      resource: 'deposit',
      ownEvents: DEPOSIT_EVENTS,
      children: { terminalEvents: CHILD_TERMINAL_EVENTS, parentNameSchema: depositNameSchema },
      resolve: (name) => stateResolver.resolveDeposit({ name }),
    })
  }
}

const CHILD_TERMINAL_EVENTS: readonly EventDefinition<{ name: string; parent: string }>[] = [
  ...MIDNIGHT_TRANSACTION_TERMINAL_STATES.map(
    (state: MidnightTransactionState) => MIDNIGHT_TRANSACTION_EVENT_BY_STATE[state],
  ),
  ...VAULT_REQUEST_TERMINAL_STATES.map(
    (state: VaultRequestState) => VAULT_REQUEST_EVENT_BY_STATE[state],
  ),
]
