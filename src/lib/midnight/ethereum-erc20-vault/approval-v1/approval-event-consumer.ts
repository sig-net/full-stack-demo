import { approvalNameSchema } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import { APPROVAL_EVENT_BY_STATE } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-controller'
import type { ApprovalStateResolver } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-resolver'
import { CallerOperationEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-event-consumer'
import type { Logger } from '@/lib/logging/logger'

export class ApprovalEventConsumer extends CallerOperationEventConsumer {
  constructor(stateResolver: ApprovalStateResolver, logger: Logger) {
    super({
      logger,
      resource: 'approval',
      events: APPROVAL_EVENT_BY_STATE,
      nameSchema: approvalNameSchema,
      resolve: (name) => stateResolver.resolveApproval({ name }),
    })
  }
}
