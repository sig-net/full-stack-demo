import 'server-only'

import type { EventPublisher } from '@/lib/event/event-publisher'
import { CallerOperationStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller-impl'
import { INITIAL_STATE } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { Supply } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { SupplyRepository } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-repository'
import {
  type CompleteSupplyArgs,
  type StartSupplyArgs,
  SUPPLY_EVENT_BY_STATE,
  SupplyStateConflict,
  type SupplyStateController,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { Logger } from '@/lib/logging/logger'

export class SupplyStateControllerImpl
  extends CallerOperationStateControllerImpl<Supply>
  implements SupplyStateController
{
  constructor(
    supplyRepository: SupplyRepository,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    vaultRequestStateController: VaultRequestStateController,
    logger: Logger,
  ) {
    super(
      {
        action: 'supply',
        completeCircuit: 'completeSupply',
        events: SUPPLY_EVENT_BY_STATE,
        conflict: SupplyStateConflict,
        signerAccountOf: (supply) => supply.vaultAccount,
      },
      supplyRepository,
      eventPublisher,
      midnightTransactionStateController,
      vaultRequestStateController,
      logger,
    )
  }

  startSupply({ unprovenTx, ...supply }: StartSupplyArgs): Promise<Supply> {
    const now = new Date()
    return this.start(
      {
        ...supply,
        state: INITIAL_STATE,
        outcome: null,
        failure: null,
        error: null,
        createTime: now,
        updateTime: now,
      },
      'startSupply',
      unprovenTx,
    )
  }

  completeSupply(args: CompleteSupplyArgs): Promise<Supply> {
    return this.complete(args)
  }
}
