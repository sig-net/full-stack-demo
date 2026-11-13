import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { CallerOperationStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-resolver-impl'
import type { RequestLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import type {
  Withdraw,
  WithdrawOutcome,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import type { WithdrawRepository } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-repository'
import type { WithdrawStateController } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-controller'
import type {
  ResolveWithdrawArgs,
  WithdrawStateResolver,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-state-resolver'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type { Logger } from '@/lib/logging/logger'

export class WithdrawStateResolverImpl
  extends CallerOperationStateResolverImpl<Withdraw>
  implements WithdrawStateResolver
{
  constructor(
    withdrawRepository: WithdrawRepository,
    stateController: WithdrawStateController,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    requestLedger: RequestLedger,
    unitOfWork: UnitOfWork,
    logger: Logger,
  ) {
    super(
      {
        action: 'withdraw',
        startCircuits: ['startWithdraw'],
        completeCircuit: 'completeWithdraw',
        outcomeOf: withdrawOutcome,
      },
      withdrawRepository,
      stateController,
      midnightTransactionRepository,
      vaultRequestRepository,
      requestLedger,
      unitOfWork,
      logger,
    )
  }

  resolveWithdraw({ name }: ResolveWithdrawArgs): Promise<void> {
    return this.resolveOperation(name)
  }
}

/** The transfer's attested output is the Borsh `bool` of its return: `01` paid the destination, anything else re-minted the coin. */
function withdrawOutcome(request: VaultRequest): WithdrawOutcome {
  return request.attestationOutputKind === 'executed' && request.attestationOutput === '01'
    ? 'sent'
    : 'refunded'
}
