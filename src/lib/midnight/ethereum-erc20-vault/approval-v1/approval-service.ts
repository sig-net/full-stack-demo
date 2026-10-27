import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Approval,
  type ApprovalCompleteInputs,
  approvalNameSchema,
  approvalRequestSchema,
  type ApprovalStartInputs,
  type ApprovalTarget,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import { userCommitmentSchema } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'
import { hexBytesSchema, uint64Schema } from '@/lib/value-schemas'

/**
 * The approval API's methods, independent of the transport that exposes them. The browser
 * builds, proves and finalises the deployer's two circuit calls from the inputs the prepare
 * methods return, and the contract refuses any other caller's secret while the call is built.
 * The two deployer actions commit the finalised bytes, which the server inspects no further: the
 * approval follows its child transaction's outcome, and the resolver reads the vault ledger
 * only when a child failed.
 */
export interface ApprovalService {
  /** Every spender the vault may grant, with the allowance the vault account holds for it now. */
  listApprovalTargets(caller: Caller, args: ListApprovalTargetsArgs): Promise<ApprovalTarget[]>
  /** The start circuit's server-decided slot, assigned afresh on every call, with nothing written. */
  prepareStartApproval(caller: Caller, args: PrepareStartApprovalArgs): Promise<ApprovalStartInputs>
  /** Reads the spender from the vault ledger and stores the approval in `AwaitingStartTransaction` with the finalised start call under it. */
  startApproval(caller: Caller, args: StartApprovalArgs): Promise<Approval>
  /** The attested request's fields the complete circuit takes, after the state check `completeApproval` repeats. */
  prepareCompleteApproval(
    caller: Caller,
    args: PrepareCompleteApprovalArgs,
  ): Promise<ApprovalCompleteInputs>
  /** Moves the approval to `AwaitingCompleteTransaction` with the finalised complete call under it. */
  completeApproval(caller: Caller, args: CompleteApprovalArgs): Promise<Approval>
  getApproval(caller: Caller, args: GetApprovalArgs): Promise<Approval | undefined>
  /** The caller's approvals, newest first. */
  listApprovals(caller: Caller, args: ListApprovalsArgs): Promise<Approval[]>
}

export const listApprovalTargetsArgsSchema = z.object({})
export type ListApprovalTargetsArgs = z.infer<typeof listApprovalTargetsArgsSchema>

/** The browser's wallet keys go into the call the browser builds and nowhere else, so no method takes them. */
export const prepareStartApprovalArgsSchema = z.object({
  approvalRequest: approvalRequestSchema,
})
export type PrepareStartApprovalArgs = z.infer<typeof prepareStartApprovalArgsSchema>

/** The slot the browser baked into the call and the commitment of the secret it built it with travel with it, and the finalised bytes are hex in the ledger's serialisation. */
export const startApprovalArgsSchema = prepareStartApprovalArgsSchema.extend({
  userCommitment: userCommitmentSchema,
  inIndex: uint64Schema,
  finalizedTx: hexBytesSchema,
})
export type StartApprovalArgs = z.infer<typeof startApprovalArgsSchema>

export const prepareCompleteApprovalArgsSchema = z.object({
  name: approvalNameSchema,
})
export type PrepareCompleteApprovalArgs = z.infer<typeof prepareCompleteApprovalArgsSchema>

export const completeApprovalArgsSchema = prepareCompleteApprovalArgsSchema.extend({
  finalizedTx: hexBytesSchema,
})
export type CompleteApprovalArgs = z.infer<typeof completeApprovalArgsSchema>

export const getApprovalArgsSchema = z.object({
  name: approvalNameSchema,
})
export type GetApprovalArgs = z.infer<typeof getApprovalArgsSchema>

export const listApprovalsArgsSchema = z.object({})
export type ListApprovalsArgs = z.infer<typeof listApprovalsArgsSchema>
