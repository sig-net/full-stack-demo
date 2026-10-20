import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import type {
  Approval,
  ApprovalRequest,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import { ApprovalCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-call-builder'
import type {
  CompleteApprovalArgs,
  PrepareCompleteApprovalArgs,
  PrepareStartApprovalArgs,
  StartApprovalArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service'
import type {
  ApprovalCompleteInputsResult,
  ApprovalResult,
  ApprovalStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-adaptor'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallStage,
  vaultRefusalOf,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/browser-caller-calls'
import { completionOutput } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/**
 * Starts an approval from the page: the server assigns the call's slot, the page builds, proves
 * and binds the kind's start call with the caller secret as its witness, and the server records
 * it for the relayer to pay and submit. The contract's deployer gate refuses any other caller
 * while the call is built, and every refusal is thrown with its message.
 */
export async function startApprovalInBrowser(args: StartApprovalInBrowserArgs): Promise<Approval> {
  const { actions, builder, wallet, callerSecret, approvalRequest, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareStartApproval(callerSecret, { approvalRequest })
  if (!prepared.ok) throw new Error(prepared.error)
  const { inIndex } = prepared.inputs
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildStart({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      inIndex,
      ...approvalRequest,
    }),
    'approval',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const started = await actions.startApproval(callerSecret, { approvalRequest, inIndex, boundTx })
  if (!started.ok) throw new Error(started.error)
  return started.approval
}

/** Completes an attested approval from the page as `startApprovalInBrowser` starts one. */
export async function completeApprovalInBrowser(
  args: CompleteApprovalInBrowserArgs,
): Promise<Approval> {
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareCompleteApproval(callerSecret, { name })
  if (!prepared.ok) throw new Error(prepared.error)
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildComplete({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      requestId: hexToBytes(prepared.inputs.requestId),
      serializedOutput: completionOutput(prepared.inputs, 1),
    }),
    'approval',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const completed = await actions.completeApproval(callerSecret, { name, boundTx })
  if (!completed.ok) throw new Error(completed.error)
  return completed.approval
}

/** The builder over the page's providers, fetching the vault's prover keys from `origin`. */
export function browserApprovalCallBuilder(
  config: ClientConfig,
  origin: string,
): ApprovalCallBuilder {
  const { providers, proofProvider } = browserVaultCallProviders(config, origin)
  return new ApprovalCallBuilder(providers, () => Promise.resolve(proofProvider))
}

/** The approval's server actions, as the page imports them. */
export interface ApprovalActions {
  prepareStartApproval(
    callerSecret: string,
    args: PrepareStartApprovalArgs,
  ): Promise<ApprovalStartInputsResult>
  startApproval(callerSecret: string, args: StartApprovalArgs): Promise<ApprovalResult>
  prepareCompleteApproval(
    callerSecret: string,
    args: PrepareCompleteApprovalArgs,
  ): Promise<ApprovalCompleteInputsResult>
  completeApproval(callerSecret: string, args: CompleteApprovalArgs): Promise<ApprovalResult>
}

interface ApprovalCallArgs {
  readonly builder: ApprovalCallBuilder
  readonly wallet: Wallet
  /** The stored identity secret, lower-case hex without `0x`, which is the call's witness. */
  readonly callerSecret: string
  readonly onStage?: (stage: CallerCallStage) => void
}

export interface StartApprovalInBrowserArgs extends ApprovalCallArgs {
  readonly actions: Pick<ApprovalActions, 'prepareStartApproval' | 'startApproval'>
  readonly approvalRequest: ApprovalRequest
}

export interface CompleteApprovalInBrowserArgs extends ApprovalCallArgs {
  readonly actions: Pick<ApprovalActions, 'prepareCompleteApproval' | 'completeApproval'>
  readonly name: string
}
