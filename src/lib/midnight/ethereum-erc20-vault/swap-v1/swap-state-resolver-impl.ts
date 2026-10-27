import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { CallerOperationStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-resolver-impl'
import type { Swap, SwapOutcome } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { SwapRepository } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-repository'
import type { SwapStateController } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-controller'
import type {
  ResolveSwapArgs,
  SwapStateResolver,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-resolver'
import type { RequestLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type { Logger } from '@/lib/logging/logger'

export class SwapStateResolverImpl
  extends CallerOperationStateResolverImpl<Swap>
  implements SwapStateResolver
{
  constructor(
    swapRepository: SwapRepository,
    stateController: SwapStateController,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    requestLedger: RequestLedger,
    unitOfWork: UnitOfWork,
    logger: Logger,
  ) {
    super(
      {
        action: 'swap',
        startCircuits: ['startSwap'],
        completeCircuit: 'completeSwap',
        outcomeOf: swapOutcome,
      },
      swapRepository,
      stateController,
      midnightTransactionRepository,
      vaultRequestRepository,
      requestLedger,
      unitOfWork,
      logger,
    )
  }

  resolveSwap({ name }: ResolveSwapArgs): Promise<void> {
    return this.resolveOperation(name)
  }
}

/** An executed trade minted the bought amount and the change, any other verdict re-minted the surrendered coin. */
function swapOutcome(request: VaultRequest): SwapOutcome {
  return request.attestationOutputKind === 'executed' ? 'swapped' : 'refunded'
}
