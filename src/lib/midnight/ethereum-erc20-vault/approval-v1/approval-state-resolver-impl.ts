import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type {
  Approval,
  ApprovalOutcome,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { ApprovalRepository } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-repository'
import type { ApprovalStateController } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-controller'
import { APPROVAL_START_CIRCUIT_BY_KIND } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-controller-impl'
import type {
  ApprovalStateResolver,
  ResolveApprovalArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-resolver'
import { CallerOperationStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-resolver-impl'
import type { RequestLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type { Logger } from '@/lib/logging/logger'

export class ApprovalStateResolverImpl
  extends CallerOperationStateResolverImpl<Approval>
  implements ApprovalStateResolver
{
  constructor(
    approvalRepository: ApprovalRepository,
    stateController: ApprovalStateController,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    requestLedger: RequestLedger,
    unitOfWork: UnitOfWork,
    logger: Logger,
  ) {
    super(
      {
        action: 'approve',
        startCircuits: Object.values(APPROVAL_START_CIRCUIT_BY_KIND),
        completeCircuit: 'completeApprove',
        outcomeOf: approvalOutcome,
      },
      approvalRepository,
      stateController,
      midnightTransactionRepository,
      vaultRequestRepository,
      requestLedger,
      unitOfWork,
      logger,
    )
  }

  resolveApproval({ name }: ResolveApprovalArgs): Promise<void> {
    return this.resolveOperation(name)
  }
}

/** The approve call's attested output is the Borsh `bool` of its return: `01` for an allowance granted. */
function approvalOutcome(request: VaultRequest): ApprovalOutcome {
  return request.attestationOutputKind === 'executed' && request.attestationOutput === '01'
    ? 'approved'
    : 'closed'
}
