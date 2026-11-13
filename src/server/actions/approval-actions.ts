'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
  credential: LoginCredential,
  args: ListApprovalTargetsArgs,
): Promise<ApprovalTargetListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.listApprovalTargets(
    credential,
    args,
  )
}

export async function prepareStartApproval(
  credential: LoginCredential,
  args: PrepareStartApprovalArgs,
): Promise<ApprovalStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.prepareStartApproval(
    credential,
    args,
  )
}

export async function startApproval(
  credential: LoginCredential,
  args: StartApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.startApproval(
    credential,
    args,
  )
}

export async function prepareCompleteApproval(
  credential: LoginCredential,
  args: PrepareCompleteApprovalArgs,
): Promise<ApprovalCompleteInputsResult> {
  return (
    await getBackend()
  ).midnight.ethereumErc20Vault.approvalV1.adaptor.prepareCompleteApproval(credential, args)
}

export async function completeApproval(
  credential: LoginCredential,
  args: CompleteApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.completeApproval(
    credential,
    args,
  )
}

export async function getApproval(
  credential: LoginCredential,
  args: GetApprovalArgs,
): Promise<ApprovalResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.getApproval(
    credential,
    args,
  )
}

export async function listApprovals(
  credential: LoginCredential,
  args: ListApprovalsArgs,
): Promise<ApprovalListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.approvalV1.adaptor.listApprovals(
    credential,
    args,
  )
}
