import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { CallerOperationStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-resolver-impl'
import type { Supply, SupplyOutcome } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { SupplyRepository } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-repository'
import type { SupplyStateController } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
import type {
  ResolveSupplyArgs,
  SupplyStateResolver,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-resolver'
import type { RequestLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type { Logger } from '@/lib/logging/logger'

export class SupplyStateResolverImpl
  extends CallerOperationStateResolverImpl<Supply>
  implements SupplyStateResolver
{
  constructor(
    supplyRepository: SupplyRepository,
    stateController: SupplyStateController,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    requestLedger: RequestLedger,
    unitOfWork: UnitOfWork,
    logger: Logger,
  ) {
    super(
      {
        action: 'supply',
        startCircuits: ['startSupply'],
        completeCircuit: 'completeSupply',
        outcomeOf: supplyOutcome,
      },
      supplyRepository,
      stateController,
      midnightTransactionRepository,
      vaultRequestRepository,
      requestLedger,
      unitOfWork,
      logger,
    )
  }

  resolveSupply({ name }: ResolveSupplyArgs): Promise<void> {
    return this.resolveOperation(name)
  }
}

/** A deposit the MPC attested as executed minted the wrapper's shares; any other verdict re-minted the underlying. */
function supplyOutcome(request: VaultRequest): SupplyOutcome {
  return request.attestationOutputKind === 'executed' ? 'supplied' : 'refunded'
}
