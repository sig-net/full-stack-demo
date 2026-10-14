import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { CallerOperationStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-resolver-impl'
import type {
  Deposit,
  DepositOutcome,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import type { DepositStateController } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type {
  DepositStateResolver,
  ResolveDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-resolver'
import type { RequestLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'

export class DepositStateResolverImpl
  extends CallerOperationStateResolverImpl<Deposit>
  implements DepositStateResolver
{
  constructor(
    depositRepository: DepositRepository,
    stateController: DepositStateController,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    requestLedger: RequestLedger,
    unitOfWork: UnitOfWork,
  ) {
    super(
      {
        label: 'deposit',
        action: 'deposit',
        startCircuits: ['startDeposit'],
        completeCircuit: 'completeDeposit',
        outcomeOf: depositOutcome,
      },
      depositRepository,
      stateController,
      midnightTransactionRepository,
      vaultRequestRepository,
      requestLedger,
      unitOfWork,
    )
  }

  resolveDeposit({ name }: ResolveDepositArgs): Promise<void> {
    return this.resolveOperation(name)
  }
}

/** The sweep's attested output is the Borsh `bool` of the transfer's success: `01` for a mint. */
function depositOutcome(request: VaultRequest): DepositOutcome {
  return request.attestationOutputKind === 'executed' && request.attestationOutput === '01'
    ? 'minted'
    : 'closed'
}
