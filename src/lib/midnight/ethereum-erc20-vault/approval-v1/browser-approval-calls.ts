import { hexToBytes } from '@sig-net/midnight'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
  const { actions, builder, wallet, login, vaultSecret, approvalRequest, onStage } = args
  const started = await runCallerCall({
    operation: 'approval',
    wallet,
    login,
    vaultSecret,
    onStage,
    prepare: async () =>
      actions.prepareStartApproval(await login.credential(), { approvalRequest }),
    circuitArgs: ({ inIndex }, caller) => ({ ...caller, inIndex, ...approvalRequest }),
    build: (circuitArgs) => builder.buildStart(circuitArgs),
    record: async ({ inIndex }, finalizedTx) =>
      actions.startApproval(await login.credential(), { approvalRequest, inIndex, finalizedTx }),
  })
  return started.approval
}

/** Completes an attested approval from the page, whose complete circuit takes no nonce. */
export async function completeApprovalInBrowser(
  args: CompleteApprovalInBrowserArgs,
): Promise<Approval> {
  const { actions, builder, wallet, login, vaultSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'approval',
    wallet,
    login,
    vaultSecret,
    onStage,
    prepare: async () => actions.prepareCompleteApproval(await login.credential(), { name }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: async (_inputs, finalizedTx) =>
      actions.completeApproval(await login.credential(), { name, finalizedTx }),
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
    credential: LoginCredential,
    args: PrepareStartApprovalArgs,
  ): Promise<ApprovalStartInputsResult>
  startApproval(credential: LoginCredential, args: StartApprovalArgs): Promise<ApprovalResult>
  prepareCompleteApproval(
    credential: LoginCredential,
    args: PrepareCompleteApprovalArgs,
  ): Promise<ApprovalCompleteInputsResult>
  completeApproval(credential: LoginCredential, args: CompleteApprovalArgs): Promise<ApprovalResult>
}

export interface StartApprovalInBrowserArgs extends CallerCallArgs<ApprovalCallBuilder> {
  readonly actions: Pick<ApprovalActions, 'prepareStartApproval' | 'startApproval'>
  readonly approvalRequest: ApprovalRequest
}

export interface CompleteApprovalInBrowserArgs extends CallerCallArgs<ApprovalCallBuilder> {
  readonly actions: Pick<ApprovalActions, 'prepareCompleteApproval' | 'completeApproval'>
  readonly name: string
}
