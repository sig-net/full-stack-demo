import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Approval,
  approvalNameSchema,
  approvalRequestSchema,
  type ApprovalTarget,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import { walletPublicKeysSchema } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'

/**
 * The approval API's methods, independent of the transport that exposes them. The two deployer
 * actions build the deployer's circuit call, which the contract refuses for any other caller,
 * and then open the one transaction that stores the approval's step and the call.
 */
export interface ApprovalService {
  /** Every spender the vault may grant, with the allowance the vault account holds for it now. */
  listApprovalTargets(caller: Caller, args: ListApprovalTargetsArgs): Promise<ApprovalTarget[]>
  /** Reads the spender from the vault ledger, builds the start call and stores the approval in `AwaitingStartTransaction`. */
  startApproval(caller: Caller, args: StartApprovalArgs): Promise<Approval>
  /** Builds the complete call for the approval's attested request and moves it to `AwaitingCompleteTransaction`. */
  completeApproval(caller: Caller, args: CompleteApprovalArgs): Promise<Approval>
  getApproval(caller: Caller, args: GetApprovalArgs): Promise<Approval | undefined>
  /** The caller's approvals, newest first. */
  listApprovals(caller: Caller, args: ListApprovalsArgs): Promise<Approval[]>
}

export const listApprovalTargetsArgsSchema = z.object({})
export type ListApprovalTargetsArgs = z.infer<typeof listApprovalTargetsArgsSchema>

export const startApprovalArgsSchema = z.object({
  approvalRequest: approvalRequestSchema,
  wallet: walletPublicKeysSchema,
})
export type StartApprovalArgs = z.infer<typeof startApprovalArgsSchema>

export const completeApprovalArgsSchema = z.object({
  name: approvalNameSchema,
  wallet: walletPublicKeysSchema,
})
export type CompleteApprovalArgs = z.infer<typeof completeApprovalArgsSchema>

export const getApprovalArgsSchema = z.object({
  name: approvalNameSchema,
})
export type GetApprovalArgs = z.infer<typeof getApprovalArgsSchema>

export const listApprovalsArgsSchema = z.object({})
export type ListApprovalsArgs = z.infer<typeof listApprovalsArgsSchema>
