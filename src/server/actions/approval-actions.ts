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
  callerAddress: string,
  args: ListApprovalTargetsArgs,
): Promise<ApprovalTargetListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.listApprovalTargets(
    callerAddress,
    args,
  )
}

export async function prepareStartApproval(
  callerAddress: string,
  args: PrepareStartApprovalArgs,
): Promise<ApprovalStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.prepareStartApproval(
    callerAddress,
    args,
  )
}

export async function startApproval(
  callerAddress: string,
  args: StartApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.startApproval(
    callerAddress,
    args,
  )
}

export async function prepareCompleteApproval(
  callerAddress: string,
  args: PrepareCompleteApprovalArgs,
): Promise<ApprovalCompleteInputsResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.approvalV1.adaptor.prepareCompleteApproval(callerAddress, args)
}

export async function completeApproval(
  callerAddress: string,
  args: CompleteApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.completeApproval(
    callerAddress,
    args,
  )
}

export async function getApproval(
  callerAddress: string,
  args: GetApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.getApproval(
    callerAddress,
    args,
  )
}

export async function listApprovals(
  callerAddress: string,
  args: ListApprovalsArgs,
): Promise<ApprovalListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.listApprovals(
    callerAddress,
    args,
  )
}
