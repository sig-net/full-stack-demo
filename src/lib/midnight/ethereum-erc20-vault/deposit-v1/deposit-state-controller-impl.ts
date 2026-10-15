import 'server-only'

import type { EventPublisher } from '@/lib/event/event-publisher'
import { CallerOperationStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller-impl'
import { INITIAL_STATE } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import {
  type CompleteDepositArgs,
  DEPOSIT_EVENT_BY_STATE,
  DepositStateConflict,
  type DepositStateController,
  type StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { Logger } from '@/lib/logging/logger'

export class DepositStateControllerImpl
  extends CallerOperationStateControllerImpl<Deposit>
  implements DepositStateController
{
  constructor(
    depositRepository: DepositRepository,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    vaultRequestStateController: VaultRequestStateController,
    logger: Logger,
  ) {
    super(
      {
        action: 'deposit',
        completeCircuit: 'completeDeposit',
        events: DEPOSIT_EVENT_BY_STATE,
        conflict: DepositStateConflict,
        signerAccountOf: (deposit) => deposit.depositAccount,
      },
      depositRepository,
      eventPublisher,
      midnightTransactionStateController,
      vaultRequestStateController,
      logger,
    )
  }

  startDeposit({ unprovenTx, ...deposit }: StartDepositArgs): Promise<Deposit> {
    const now = new Date()
    return this.start(
      {
        ...deposit,
        state: INITIAL_STATE,
        outcome: null,
        failure: null,
        error: null,
        createTime: now,
        updateTime: now,
      },
      'startDeposit',
      unprovenTx,
    )
  }

  completeDeposit(args: CompleteDepositArgs): Promise<Deposit> {
    return this.complete(args)
  }
}
