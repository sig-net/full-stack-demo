import { CallerOperationEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-event-consumer'
import { withdrawNameSchema } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import { WITHDRAW_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-controller'
import type { WithdrawStateResolver } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-resolver'

export class WithdrawEventConsumer extends CallerOperationEventConsumer {
  constructor(stateResolver: WithdrawStateResolver) {
    super({
      resource: 'withdraw',
      events: WITHDRAW_EVENT_BY_STATE,
      nameSchema: withdrawNameSchema,
      resolve: (name) => stateResolver.resolveWithdraw({ name }),
    })
  }
}
