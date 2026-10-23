import { hexToBytes } from '@sig-net/midnight'

import type {
  ApprovalCompleteInputs,
  ApprovalRequest,
  ApprovalStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { ApprovalResult } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import {
  completionOutput,
  finalizeAsUser,
  type FinalizedCallerCall,
  secretKeyOf,
} from './user-caller-call'
import type { UserWallet } from './user-wallet'

/** The kind's start call for the server's slot, with the vault secret as the witness and the user wallet's keys. */
export function buildStartCall(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  approvalRequest: ApprovalRequest,
  inputs: ApprovalStartInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.approvalV1
  return finalizeAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(vaultSecret),
      wallet: user.publicKeys,
      inIndex: inputs.inIndex,
      ...approvalRequest,
    }),
  )
}

/** The complete call for the attested request's inputs, which takes no nonce. */
export function buildCompleteCall(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  inputs: ApprovalCompleteInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.approvalV1
  return finalizeAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(vaultSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
    }),
  )
}

/** `prepareStartApproval`, the build, the finalisation and `startApproval`, as the admin page's spender list runs them: a refusal at either server call is the result. */
export async function startApprovalAsUser(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  approvalRequest: ApprovalRequest,
): Promise<ApprovalResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.approvalV1
  const prepared = await adaptor.prepareStartApproval(await user.login(), { approvalRequest })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildStartCall(
    backend,
    vaultSecret,
    user,
    approvalRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startApproval(await user.login(), {
    approvalRequest,
    inIndex: prepared.inputs.inIndex,
    finalizedTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, startApproval answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteApproval`, the build, the finalisation and `completeApproval`, as the activity table's completion runs them. */
export async function completeApprovalAsUser(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  name: string,
): Promise<ApprovalResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.approvalV1
  const prepared = await adaptor.prepareCompleteApproval(await user.login(), { name })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildCompleteCall(
    backend,
    vaultSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeApproval(await user.login(), { name, finalizedTx })
  log(
    `complete call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, completeApproval answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
