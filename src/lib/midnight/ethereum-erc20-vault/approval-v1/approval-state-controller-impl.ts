import 'server-only'

import type { EventPublisher } from '@/lib/event/event-publisher'
import type {
  Approval,
  ApprovalKind,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { ApprovalRepository } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-repository'
import {
  APPROVAL_EVENT_BY_STATE,
  ApprovalStateConflict,
  type ApprovalStateController,
  type CompleteApprovalArgs,
  type StartApprovalArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-controller'
import { CallerOperationStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller-impl'
import { INITIAL_STATE } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import type { Logger } from '@/lib/logging/logger'

/** The start circuit each kind of approval calls. */
export const APPROVAL_START_CIRCUIT_BY_KIND = {
  router: 'startApproveRouter',
  stata: 'startApproveStata',
} as const satisfies Record<ApprovalKind, string>

export class ApprovalStateControllerImpl
  extends CallerOperationStateControllerImpl<Approval>
  implements ApprovalStateController
{
  constructor(
    approvalRepository: ApprovalRepository,
    eventPublisher: EventPublisher,
    midnightTransactionStateController: MidnightTransactionStateController,
    vaultRequestStateController: VaultRequestStateController,
    logger: Logger,
  ) {
    super(
      {
        action: 'approve',
        completeCircuit: 'completeApprove',
        events: APPROVAL_EVENT_BY_STATE,
        conflict: ApprovalStateConflict,
        signerAccountOf: (approval) => approval.vaultAccount,
      },
      approvalRepository,
      eventPublisher,
      midnightTransactionStateController,
      vaultRequestStateController,
      logger,
    )
  }

  startApproval({ call, ...approval }: StartApprovalArgs): Promise<Approval> {
    const now = new Date()
    return this.start(
      {
        ...approval,
        state: INITIAL_STATE,
        outcome: null,
        failure: null,
        error: null,
        createTime: now,
        updateTime: now,
      },
      APPROVAL_START_CIRCUIT_BY_KIND[approval.kind],
      call,
    )
  }

  completeApproval(args: CompleteApprovalArgs): Promise<Approval> {
    return this.complete(args)
  }
}
