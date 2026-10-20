'use server'

import type {
  CompleteApprovalArgs,
  GetApprovalArgs,
  ListApprovalsArgs,
  ListApprovalTargetsArgs,
  PrepareCompleteApprovalArgs,
  PrepareStartApprovalArgs,
  StartApprovalArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service'
import type {
  ApprovalCompleteInputsResult,
  ApprovalListResult,
  ApprovalResult,
  ApprovalStartInputsResult,
  ApprovalTargetListResult,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-adaptor'
import { getBackend } from '@/server/backend'

export async function listApprovalTargets(
  callerSecret: string,
  args: ListApprovalTargetsArgs,
): Promise<ApprovalTargetListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.listApprovalTargets(
    callerSecret,
    args,
  )
}

export async function prepareStartApproval(
  callerSecret: string,
  args: PrepareStartApprovalArgs,
): Promise<ApprovalStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.prepareStartApproval(
    callerSecret,
    args,
  )
}

export async function startApproval(
  callerSecret: string,
  args: StartApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.startApproval(
    callerSecret,
    args,
  )
}

export async function prepareCompleteApproval(
  callerSecret: string,
  args: PrepareCompleteApprovalArgs,
): Promise<ApprovalCompleteInputsResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.approvalV1.adaptor.prepareCompleteApproval(callerSecret, args)
}

export async function completeApproval(
  callerSecret: string,
  args: CompleteApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.completeApproval(
    callerSecret,
    args,
  )
}

export async function getApproval(
  callerSecret: string,
  args: GetApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.getApproval(
    callerSecret,
    args,
  )
}

export async function listApprovals(
  callerSecret: string,
  args: ListApprovalsArgs,
): Promise<ApprovalListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.listApprovals(
    callerSecret,
    args,
  )
}
