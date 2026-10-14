import { CallerOperationEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-event-consumer'
import { depositNameSchema } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { DEPOSIT_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type { DepositStateResolver } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-resolver'

export class DepositEventConsumer extends CallerOperationEventConsumer {
  constructor(stateResolver: DepositStateResolver) {
    super({
      resource: 'deposit',
      events: DEPOSIT_EVENT_BY_STATE,
      nameSchema: depositNameSchema,
      resolve: (name) => stateResolver.resolveDeposit({ name }),
    })
  }
}
