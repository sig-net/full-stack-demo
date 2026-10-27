import { hexToBytes } from '@sig-net/midnight'

import type {
  WithdrawCompleteInputs,
  WithdrawRequest,
  WithdrawStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import type { WithdrawResult } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import {
  completionOutput,
  finalizeAsUser,
  type FinalizedCallerCall,
  secretKeyOf,
  userCommitmentOf,
} from './user-caller-call'
import type { UserWallet } from './user-wallet'

/** The start call for the server's slot, with the vault secret as the witness, the user wallet's keys and its coin of the sent token. */
export function buildStartCall(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  withdrawRequest: WithdrawRequest,
  inputs: WithdrawStartInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.withdrawV1
  return finalizeAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(vaultSecret),
      wallet: user.publicKeys,
      inIndex: inputs.inIndex,
      ...withdrawRequest,
    }),
  )
}

/** The complete call for the attested request's inputs, under a fresh mint nonce. */
export function buildCompleteCall(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  inputs: WithdrawCompleteInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.withdrawV1
  return finalizeAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(vaultSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
  )
}

/** `prepareStartWithdraw`, the build, the finalisation and `startWithdraw`, as the send dialog runs them: a refusal at either server call is the result. */
export async function startWithdrawAsUser(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  withdrawRequest: WithdrawRequest,
): Promise<WithdrawResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.withdrawV1
  const prepared = await adaptor.prepareStartWithdraw(await user.login(), { withdrawRequest })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildStartCall(
    backend,
    vaultSecret,
    user,
    withdrawRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startWithdraw(await user.login(), {
    withdrawRequest,
    userCommitment: userCommitmentOf(vaultSecret),
    inIndex: prepared.inputs.inIndex,
    finalizedTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, startWithdraw answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteWithdraw`, the build, the finalisation and `completeWithdraw`, as the activity table's completion runs them. */
export async function completeWithdrawAsUser(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  name: string,
): Promise<WithdrawResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.withdrawV1
  const prepared = await adaptor.prepareCompleteWithdraw(await user.login(), { name })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildCompleteCall(
    backend,
    vaultSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeWithdraw(await user.login(), { name, finalizedTx })
  log(
    `complete call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, completeWithdraw answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
