import { hexToBytes } from '@sig-net/midnight'

import type {
  DepositCompleteInputs,
  DepositRequest,
  DepositStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { DepositResult } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import {
  completionOutput,
  finalizeAsUser,
  type FinalizedCallerCall,
  secretKeyOf,
} from './user-caller-call'
import type { UserWallet } from './user-wallet'

/** The start call for the server's assignment, with the caller secret as the witness and the user wallet's keys. */
export function buildStartCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  depositRequest: DepositRequest,
  inputs: DepositStartInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.depositV1
  return finalizeAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      inIndex: inputs.inIndex,
      evmNonce: inputs.evmNonce,
      gas: {
        gasLimit: inputs.gasLimit,
        maxFeePerGas: inputs.maxFeePerGas,
        maxPriorityFeePerGas: inputs.maxPriorityFeePerGas,
      },
      erc20Address: depositRequest.erc20Address,
      amount: depositRequest.amount,
    }),
  )
}

/** The complete call for the attested request's inputs, under a fresh mint nonce. */
export function buildCompleteCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  inputs: DepositCompleteInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.depositV1
  return finalizeAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
  )
}

/** `prepareStartDeposit`, the build, the finalisation and `startDeposit`, as the deposit dialog runs them: a refusal at either server call is the result. */
export async function startDepositAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  depositRequest: DepositRequest,
): Promise<DepositResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
  const wallet = user.publicKeys
  const prepared = await adaptor.prepareStartDeposit(callerSecret, { depositRequest, wallet })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildStartCall(
    backend,
    callerSecret,
    user,
    depositRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startDeposit(callerSecret, {
    depositRequest,
    wallet,
    inIndex: prepared.inputs.inIndex,
    evmNonce: prepared.inputs.evmNonce,
    finalizedTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, startDeposit answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteDeposit`, the build, the finalisation and `completeDeposit`, as the activity table's completion runs them. */
export async function completeDepositAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  name: string,
): Promise<DepositResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
  const wallet = user.publicKeys
  const prepared = await adaptor.prepareCompleteDeposit(callerSecret, { name, wallet })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildCompleteCall(
    backend,
    callerSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeDeposit(callerSecret, { name, wallet, finalizedTx })
  log(
    `complete call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, completeDeposit answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
