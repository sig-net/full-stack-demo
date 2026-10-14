import {
  type Approval,
  approvalNameSchema,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import {
  type CallerOperationEvents,
  callerOperationEvents,
  CallerOperationStateConflict,
  type CallerOperationStateController,
  type CompleteOperationArgs,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'

/**
 * The only writer of an approval's state: the caller operation's transitions over the approval
 * row, plus the two deployer actions, `startApproval` and `completeApproval`, which also commit
 * the deployer's circuit call under the approval. Methods open no transaction: the caller is
 * the write boundary.
 */
export interface ApprovalStateController extends CallerOperationStateController<Approval> {
  /** Stores an approval in `AwaitingStartTransaction` and commits the deployer's start call under it. */
  startApproval(args: StartApprovalArgs): Promise<Approval>
  /** `AwaitingCompletion` to `AwaitingCompleteTransaction`, committing the deployer's complete call under the approval. */
  completeApproval(args: CompleteApprovalArgs): Promise<Approval>
}

/** What the starter decides. The controller sets the entry state, the outcome fields, and the timestamps. */
export interface StartApprovalArgs extends Omit<
  Approval,
  'state' | 'outcome' | 'failure' | 'error' | 'createTime' | 'updateTime'
> {
  /** The start circuit call, built with the approval's assigned fields. */
  unprovenTx: string
}

export type CompleteApprovalArgs = CompleteOperationArgs

/** The approval is not in a state the action applies to, so another actor got there first. */
export class ApprovalStateConflict extends CallerOperationStateConflict {
  readonly name = 'ApprovalStateConflict'
}

/** One lifecycle event per state entered, keyed by the approval name. */
export const APPROVAL_EVENT_BY_STATE: CallerOperationEvents = callerOperationEvents(
  'midnight.ethereum-erc20-vault.approval-v1',
  approvalNameSchema,
)

export const APPROVAL_EVENTS = Object.values(APPROVAL_EVENT_BY_STATE)
