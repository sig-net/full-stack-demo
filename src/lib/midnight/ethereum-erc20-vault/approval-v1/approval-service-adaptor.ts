import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type {
  Approval,
  ApprovalCompleteInputs,
  ApprovalStartInputs,
  ApprovalTarget,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import {
  type ApprovalService,
  completeApprovalArgsSchema,
  getApprovalArgsSchema,
  listApprovalsArgsSchema,
  listApprovalTargetsArgsSchema,
  prepareCompleteApprovalArgsSchema,
  prepareStartApprovalArgsSchema,
  startApprovalArgsSchema,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the approval service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each deployer action itself, after its ledger and row reads.
 */
export class ApprovalServiceAdaptor {
  private readonly approvalService: ApprovalService
  private readonly logger: Logger

  constructor(approvalService: ApprovalService, logger: Logger) {
    this.approvalService = approvalService
    this.logger = logger
  }

  async listApprovalTargets(
    callerSecret: string,
    args: unknown,
  ): Promise<ApprovalTargetListResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'listApprovalTargets', caller: caller.name })
    const parsed = listApprovalTargetsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return {
      ok: true,
      targets: await this.approvalService.listApprovalTargets(caller, parsed.data),
    }
  }

  async prepareStartApproval(
    callerSecret: string,
    args: unknown,
  ): Promise<ApprovalStartInputsResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'prepareStartApproval', caller: caller.name })
    const parsed = prepareStartApprovalArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return {
      ok: true,
      inputs: await this.approvalService.prepareStartApproval(caller, parsed.data),
    }
  }

  async startApproval(callerSecret: string, args: unknown): Promise<ApprovalResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'startApproval', caller: caller.name })
    const parsed = startApprovalArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<ApprovalResult>(async () => ({
      ok: true,
      approval: await this.approvalService.startApproval(caller, parsed.data),
    }))
  }

  async prepareCompleteApproval(
    callerSecret: string,
    args: unknown,
  ): Promise<ApprovalCompleteInputsResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'prepareCompleteApproval', caller: caller.name })
    const parsed = prepareCompleteApprovalArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<ApprovalCompleteInputsResult>(async () => ({
      ok: true,
      inputs: await this.approvalService.prepareCompleteApproval(caller, parsed.data),
    }))
  }

  async completeApproval(callerSecret: string, args: unknown): Promise<ApprovalResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'completeApproval', caller: caller.name })
    const parsed = completeApprovalArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<ApprovalResult>(async () => ({
      ok: true,
      approval: await this.approvalService.completeApproval(caller, parsed.data),
    }))
  }

  async getApproval(callerSecret: string, args: unknown): Promise<ApprovalResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getApproval', caller: caller.name })
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
    this.logger.debug('method called', { method: 'listApprovals', caller: caller.name })
    const parsed = listApprovalsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, approvals: await this.approvalService.listApprovals(caller, parsed.data) }
  }
}

export type ApprovalResult = { readonly ok: true; readonly approval: Approval } | Refused

export type ApprovalListResult = { readonly ok: true; readonly approvals: Approval[] } | Refused

export type ApprovalTargetListResult =
  | { readonly ok: true; readonly targets: ApprovalTarget[] }
  | Refused

export type ApprovalStartInputsResult =
  | { readonly ok: true; readonly inputs: ApprovalStartInputs }
  | Refused

export type ApprovalCompleteInputsResult =
  | { readonly ok: true; readonly inputs: ApprovalCompleteInputs }
  | Refused

type Refused = { readonly ok: false; readonly error: string }

/** A state conflict is a refusal the caller can act on. */
async function outcomeOf<Result>(action: () => Promise<Result>): Promise<Result | Refused> {
  try {
    return await action()
  } catch (error: unknown) {
    if (error instanceof CallerOperationStateConflict) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}
