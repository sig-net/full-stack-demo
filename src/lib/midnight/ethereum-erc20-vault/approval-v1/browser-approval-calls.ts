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
  type CallerCallArgs,
  runCallerCall,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import { completionOutput } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'

/** Starts an approval from the page with the kind's start circuit, whose deployer gate refuses any other caller while the call is built. */
export async function startApprovalInBrowser(args: StartApprovalInBrowserArgs): Promise<Approval> {
  const { actions, builder, wallet, callerAddress, vaultSecret, approvalRequest, onStage } = args
  const started = await runCallerCall({
    operation: 'approval',
    wallet,
    callerAddress,
    vaultSecret,
    onStage,
    prepare: () => actions.prepareStartApproval(callerAddress, { approvalRequest }),
    circuitArgs: ({ inIndex }, caller) => ({ ...caller, inIndex, ...approvalRequest }),
    build: (circuitArgs) => builder.buildStart(circuitArgs),
    record: ({ inIndex }, finalizedTx) =>
      actions.startApproval(callerAddress, { approvalRequest, inIndex, finalizedTx }),
  })
  return started.approval
}

/** Completes an attested approval from the page, whose complete circuit takes no nonce. */
export async function completeApprovalInBrowser(
  args: CompleteApprovalInBrowserArgs,
): Promise<Approval> {
  const { actions, builder, wallet, callerAddress, vaultSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'approval',
    wallet,
    callerAddress,
    vaultSecret,
    onStage,
    prepare: () => actions.prepareCompleteApproval(callerAddress, { name }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: (_inputs, finalizedTx) =>
      actions.completeApproval(callerAddress, { name, finalizedTx }),
  })
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
    callerAddress: string,
    args: PrepareStartApprovalArgs,
  ): Promise<ApprovalStartInputsResult>
  startApproval(callerAddress: string, args: StartApprovalArgs): Promise<ApprovalResult>
  prepareCompleteApproval(
    callerAddress: string,
    args: PrepareCompleteApprovalArgs,
  ): Promise<ApprovalCompleteInputsResult>
  completeApproval(callerAddress: string, args: CompleteApprovalArgs): Promise<ApprovalResult>
}

export interface StartApprovalInBrowserArgs extends CallerCallArgs<ApprovalCallBuilder> {
  readonly actions: Pick<ApprovalActions, 'prepareStartApproval' | 'startApproval'>
  readonly approvalRequest: ApprovalRequest
}

export interface CompleteApprovalInBrowserArgs extends CallerCallArgs<ApprovalCallBuilder> {
  readonly actions: Pick<ApprovalActions, 'prepareCompleteApproval' | 'completeApproval'>
  readonly name: string
}
