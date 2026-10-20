import { hexToBytes } from '@sig-net/midnight'

import type {
  ApprovalCompleteInputs,
  ApprovalRequest,
  ApprovalStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { ApprovalResult } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import { bindAsUser, type BoundCallerCall, completionOutput, secretKeyOf } from './user-caller-call'
import type { UserWallet } from './user-wallet'

/** The kind's start call for the server's slot, with the caller secret as the witness and the user wallet's keys. */
export function buildStartCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  approvalRequest: ApprovalRequest,
  inputs: ApprovalStartInputs,
): Promise<BoundCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.approvalV1
  return bindAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      inIndex: inputs.inIndex,
      ...approvalRequest,
    }),
  )
}

/** The complete call for the attested request's inputs, which takes no nonce. */
export function buildCompleteCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  inputs: ApprovalCompleteInputs,
): Promise<BoundCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.approvalV1
  return bindAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
    }),
  )
}

/** `prepareStartApproval`, the build, the bind and `startApproval`, as the admin page's spender list runs them: a refusal at either server call is the result. */
export async function startApprovalAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  approvalRequest: ApprovalRequest,
): Promise<ApprovalResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.approvalV1
  const prepared = await adaptor.prepareStartApproval(callerSecret, { approvalRequest })
  if (!prepared.ok) return prepared
  const { boundTx, buildMs, bindMs } = await buildStartCall(
    backend,
    callerSecret,
    user,
    approvalRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startApproval(callerSecret, {
    approvalRequest,
    inIndex: prepared.inputs.inIndex,
    boundTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, bound in ${String(bindMs)} ms, startApproval answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteApproval`, the build, the bind and `completeApproval`, as the activity table's completion runs them. */
export async function completeApprovalAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  name: string,
): Promise<ApprovalResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.approvalV1
  const prepared = await adaptor.prepareCompleteApproval(callerSecret, { name })
  if (!prepared.ok) return prepared
  const { boundTx, buildMs, bindMs } = await buildCompleteCall(
    backend,
    callerSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeApproval(callerSecret, { name, boundTx })
  log(
    `complete call built in ${String(buildMs)} ms, bound in ${String(bindMs)} ms, completeApproval answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
