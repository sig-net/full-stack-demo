import 'server-only'

import type { EventPublisher } from '@/lib/event/event-publisher'
import { CallerOperationStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller-impl'
import { INITIAL_STATE } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { Withdraw } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import type { WithdrawRepository } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-repository'
import {
  type CompleteWithdrawArgs,
  type StartWithdrawArgs,
  WITHDRAW_EVENT_BY_STATE,
  WithdrawStateConflict,
  type WithdrawStateController,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-controller'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { Logger } from '@/lib/logging/logger'

export class WithdrawStateControllerImpl
  extends CallerOperationStateControllerImpl<Withdraw>
  implements WithdrawStateController
{
  constructor(
    withdrawRepository: WithdrawRepository,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    vaultRequestStateController: VaultRequestStateController,
    logger: Logger,
  ) {
    super(
      {
        action: 'withdraw',
        completeCircuit: 'completeWithdraw',
        events: WITHDRAW_EVENT_BY_STATE,
        conflict: WithdrawStateConflict,
        signerAccountOf: (withdraw) => withdraw.vaultAccount,
      },
      withdrawRepository,
      eventPublisher,
      midnightTransactionStateController,
      vaultRequestStateController,
      logger,
    )
  }

  startWithdraw({ call, ...withdraw }: StartWithdrawArgs): Promise<Withdraw> {
    const now = new Date()
    return this.start(
      {
        ...withdraw,
        state: INITIAL_STATE,
        outcome: null,
        failure: null,
        error: null,
        createTime: now,
        updateTime: now,
      },
      'startWithdraw',
      call,
    )
  }

  completeWithdraw(args: CompleteWithdrawArgs): Promise<Withdraw> {
    return this.complete(args)
  }
}
