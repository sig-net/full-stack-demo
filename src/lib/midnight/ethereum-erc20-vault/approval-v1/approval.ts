import { z } from 'zod'

import { CALLER_COLLECTION } from '@/lib/caller/caller'
import {
  CALLER_OPERATION_FAILURES,
  CALLER_OPERATION_PENDING_STATES,
  CALLER_OPERATION_STATES,
  CALLER_OPERATION_TERMINAL_STATES,
  type CallerOperationFailure,
  callerOperationFailureSchema,
  type CallerOperationState,
  callerOperationStateSchema,
  isTerminalCallerOperationState,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
import type { CompletionInputs } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import { evmAddressSchema, HEX_32_BYTES, uint64Schema, UUID } from '@/lib/value-schemas'

/** The collection segment of an approval's resource name. */
export const APPROVAL_COLLECTION = 'ethereum-erc20-vault-approvals'

/** `callers/{caller}/ethereum-erc20-vault-approvals/{approval}`, where the approval is a UUID. */
export const approvalNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${APPROVAL_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${APPROVAL_COLLECTION}/{uuid}`,
  )

/** The approval's lifecycle is the caller operation's, under its own names. */
export const APPROVAL_STATES = CALLER_OPERATION_STATES

export const approvalStateSchema = callerOperationStateSchema

export type ApprovalState = CallerOperationState

export const APPROVAL_TERMINAL_STATES = CALLER_OPERATION_TERMINAL_STATES

export const isTerminalApprovalState = isTerminalCallerOperationState

export const APPROVAL_PENDING_STATES = CALLER_OPERATION_PENDING_STATES

export const APPROVAL_FAILURES = CALLER_OPERATION_FAILURES

export const approvalFailureSchema = callerOperationFailureSchema

export type ApprovalFailure = CallerOperationFailure

/** The two spenders the contract grants: the Uniswap router on a token a swap sells, the stata wrapper on its underlying. */
export const APPROVAL_KINDS = ['router', 'stata'] as const

export const approvalKindSchema = z.enum(APPROVAL_KINDS)

export type ApprovalKind = z.infer<typeof approvalKindSchema>

/** What the complete circuit did: the approve call returned true, or the request closed without an allowance. */
export const APPROVAL_OUTCOMES = ['approved', 'closed'] as const

export const approvalOutcomeSchema = z.enum(APPROVAL_OUTCOMES)

export type ApprovalOutcome = z.infer<typeof approvalOutcomeSchema>

/**
 * The approval resource: the vault account granting one of its contract-fixed spenders an
 * unlimited allowance on one ERC20, which only the vault's deployer may start and complete.
 * The server assigns the slot before the browser builds the kind's start circuit call, and reads
 * the spender (and the stata underlying) from the vault ledger when it commits it.
 */
export const approvalSchema = z.object({
  name: approvalNameSchema,
  kind: approvalKindSchema,
  /** The ERC20 the allowance is granted on: the request's token for the router, the stata underlying for the wrapper. */
  erc20Address: evmAddressSchema,
  /** The account allowed to spend: the pinned router or the stata token. */
  spender: evmAddressSchema,
  state: approvalStateSchema,
  /** The circuit's `inIndex`: the request's slot in the vault's buffers, chosen at random. */
  inIndex: uint64Schema,
  /** The EVM account the MPC signs the approve call from: the vault's own. */
  vaultAccount: evmAddressSchema,
  /** Set with `Completed`. */
  outcome: approvalOutcomeSchema.nullable(),
  /** Set with `Failed`. */
  failure: approvalFailureSchema.nullable(),
  /** The child's message behind a failure, where there was one. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type Approval = z.infer<typeof approvalSchema>

/** What the deployer supplies to start an approval: the kind, and for the router the token. */
export const approvalRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('router'), erc20Address: evmAddressSchema }),
  z.object({ kind: z.literal('stata') }),
])

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>

/** What the server assigns to a start call, afresh on every `prepareStartApproval`: the slot, the one input of either start circuit the request does not carry. */
export type ApprovalStartInputs = Pick<Approval, 'inIndex'>

/** What the complete circuit takes from the approval's attested request. */
export type ApprovalCompleteInputs = CompletionInputs

/** One spender the vault may grant, with what the vault account has allowed it so far. */
export const approvalTargetSchema = z.object({
  kind: approvalKindSchema,
  erc20Address: evmAddressSchema,
  spender: evmAddressSchema,
  /** The allowance on the chain now, in the token's base units. */
  allowance: z.bigint().nonnegative(),
})

export type ApprovalTarget = z.infer<typeof approvalTargetSchema>

/** The allowance the vault account holds for the Uniswap router on the token, or null while the targets are unread or name no such router entry. */
export function routerAllowanceOf(
  targets: readonly ApprovalTarget[] | undefined,
  erc20Address: string,
): bigint | null {
  const target = targets?.find(
    (candidate) =>
      candidate.kind === 'router' &&
      candidate.erc20Address.toLowerCase() === erc20Address.toLowerCase(),
  )
  return target === undefined ? null : target.allowance
}

export function approvalName(parent: string, id: string): string {
  return `${parent}/${APPROVAL_COLLECTION}/${id}`
}
