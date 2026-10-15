import 'server-only'

import type { EventPublisher } from '@/lib/event/event-publisher'
import { CallerOperationStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller-impl'
import { INITIAL_STATE } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { Redeem } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { RedeemRepository } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-repository'
import {
  type CompleteRedeemArgs,
  type StartRedeemArgs,
  REDEEM_EVENT_BY_STATE,
  RedeemStateConflict,
  type RedeemStateController,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-controller'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { Logger } from '@/lib/logging/logger'

export class RedeemStateControllerImpl
  extends CallerOperationStateControllerImpl<Redeem>
  implements RedeemStateController
{
  constructor(
    redeemRepository: RedeemRepository,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    vaultRequestStateController: VaultRequestStateController,
    logger: Logger,
  ) {
    super(
      {
        action: 'redeem',
        completeCircuit: 'completeRedeem',
        events: REDEEM_EVENT_BY_STATE,
        conflict: RedeemStateConflict,
        signerAccountOf: (redeem) => redeem.vaultAccount,
      },
      redeemRepository,
      eventPublisher,
      midnightTransactionStateController,
      vaultRequestStateController,
      logger,
    )
  }

  startRedeem({ unprovenTx, ...redeem }: StartRedeemArgs): Promise<Redeem> {
    const now = new Date()
    return this.start(
      {
        ...redeem,
        state: INITIAL_STATE,
        outcome: null,
        failure: null,
        error: null,
        createTime: now,
        updateTime: now,
      },
      'startRedeem',
      unprovenTx,
    )
  }

  completeRedeem(args: CompleteRedeemArgs): Promise<Redeem> {
    return this.complete(args)
  }
}
