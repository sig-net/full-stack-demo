import { hexToBytes } from '@sig-net/midnight'

import type {
  SupplyCompleteInputs,
  SupplyRequest,
  SupplyStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { SupplyResult } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import {
  completionOutput,
  finalizeAsUser,
  type FinalizedCallerCall,
  secretKeyOf,
} from './user-caller-call'
import type { UserWallet } from './user-wallet'

/** The start call for the server's slot and pinned underlying, with the caller secret as the witness, the user wallet's keys and its coin of the underlying. */
export function buildStartCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  supplyRequest: SupplyRequest,
  inputs: SupplyStartInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.supplyV1
  return finalizeAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      inIndex: inputs.inIndex,
      underlyingErc20Address: inputs.underlyingErc20Address,
      ...supplyRequest,
    }),
  )
}

/** The complete call for the attested request's inputs, under a fresh mint nonce. */
export function buildCompleteCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  inputs: SupplyCompleteInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.supplyV1
  return finalizeAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
  )
}

/** `prepareStartSupply`, the build, the finalisation and `startSupply`, as the lend panel runs them: a refusal at either server call is the result. */
export async function startSupplyAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  supplyRequest: SupplyRequest,
): Promise<SupplyResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.supplyV1
  const prepared = await adaptor.prepareStartSupply(callerSecret, { supplyRequest })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildStartCall(
    backend,
    callerSecret,
    user,
    supplyRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startSupply(callerSecret, {
    supplyRequest,
    inIndex: prepared.inputs.inIndex,
    finalizedTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, startSupply answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteSupply`, the build, the finalisation and `completeSupply`, as the activity table's completion runs them. */
export async function completeSupplyAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  name: string,
): Promise<SupplyResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.supplyV1
  const prepared = await adaptor.prepareCompleteSupply(callerSecret, { name })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildCompleteCall(
    backend,
    callerSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeSupply(callerSecret, { name, finalizedTx })
  log(
    `complete call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, completeSupply answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
