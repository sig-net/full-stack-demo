import 'server-only'

import type { EventPublisher } from '@/lib/event/event-publisher'
import { CallerOperationStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller-impl'
import { INITIAL_STATE } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { Swap } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { SwapRepository } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-repository'
import {
  type CompleteSwapArgs,
  type StartSwapArgs,
  SWAP_EVENT_BY_STATE,
  SwapStateConflict,
  type SwapStateController,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-controller'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { Logger } from '@/lib/logging/logger'

export class SwapStateControllerImpl
  extends CallerOperationStateControllerImpl<Swap>
  implements SwapStateController
{
  constructor(
    swapRepository: SwapRepository,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    vaultRequestStateController: VaultRequestStateController,
    logger: Logger,
  ) {
    super(
      {
        action: 'swap',
        completeCircuit: 'completeSwap',
        events: SWAP_EVENT_BY_STATE,
        conflict: SwapStateConflict,
        signerAccountOf: (swap) => swap.vaultAccount,
      },
      swapRepository,
      eventPublisher,
      midnightTransactionStateController,
      vaultRequestStateController,
      logger,
    )
  }

  startSwap({ unprovenTx, ...swap }: StartSwapArgs): Promise<Swap> {
    const now = new Date()
    return this.start(
      {
        ...swap,
        state: INITIAL_STATE,
        outcome: null,
        failure: null,
        error: null,
        createTime: now,
        updateTime: now,
      },
      'startSwap',
      unprovenTx,
    )
  }

  completeSwap(args: CompleteSwapArgs): Promise<Swap> {
    return this.complete(args)
  }
}
