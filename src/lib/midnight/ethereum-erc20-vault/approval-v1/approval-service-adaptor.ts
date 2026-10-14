import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type {
  Approval,
  ApprovalTarget,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import {
  type ApprovalService,
  completeApprovalArgsSchema,
  getApprovalArgsSchema,
  listApprovalsArgsSchema,
  listApprovalTargetsArgsSchema,
  startApprovalArgsSchema,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import { circuitAssertMessage } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'

/**
 * Adapts the approval service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each deployer action itself, after the circuit build.
 */
export class ApprovalServiceAdaptor {
  private readonly approvalService: ApprovalService

  constructor(approvalService: ApprovalService) {
    this.approvalService = approvalService
  }

  async listApprovalTargets(
    callerSecret: string,
    args: unknown,
  ): Promise<ApprovalTargetListResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = listApprovalTargetsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return {
      ok: true,
      targets: await this.approvalService.listApprovalTargets(caller, parsed.data),
    }
  }

  async startApproval(callerSecret: string, args: unknown): Promise<ApprovalResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = startApprovalArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.approvalService.startApproval(caller, parsed.data))
  }

  async completeApproval(callerSecret: string, args: unknown): Promise<ApprovalResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = completeApprovalArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf(() => this.approvalService.completeApproval(caller, parsed.data))
  }

  async getApproval(callerSecret: string, args: unknown): Promise<ApprovalResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = getApprovalArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const approval = await this.approvalService.getApproval(caller, parsed.data)
    if (approval === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, approval }
  }

  async listApprovals(callerSecret: string, args: unknown): Promise<ApprovalListResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = listApprovalsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, approvals: await this.approvalService.listApprovals(caller, parsed.data) }
  }
}

export type ApprovalResult =
  | { readonly ok: true; readonly approval: Approval }
  | { readonly ok: false; readonly error: string }

export type ApprovalListResult =
  | { readonly ok: true; readonly approvals: Approval[] }
  | { readonly ok: false; readonly error: string }

export type ApprovalTargetListResult =
  | { readonly ok: true; readonly targets: ApprovalTarget[] }
  | { readonly ok: false; readonly error: string }

/** A state conflict and a contract assert firing at build time (the deployer gate among them) are the vault refusing the call. */
async function outcomeOf(action: () => Promise<Approval>): Promise<ApprovalResult> {
  try {
    return { ok: true, approval: await action() }
  } catch (error: unknown) {
    if (error instanceof CallerOperationStateConflict) return { ok: false, error: error.message }
    const refusal = circuitAssertMessage(error)
    if (refusal !== undefined) return { ok: false, error: refusal }
    throw error
  }
}
