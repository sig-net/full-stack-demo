import { hexToBytes } from '@sig-net/midnight'

import type {
  SwapCompleteInputs,
  SwapRequest,
  SwapStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { SwapResult } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service-adaptor'
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

/** The start call for the server's slot, with the vault secret as the witness, the user wallet's keys and its coin of the sold token. */
export function buildStartCall(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  swapRequest: SwapRequest,
  inputs: SwapStartInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.swapV1
  return finalizeAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(vaultSecret),
      wallet: user.publicKeys,
      inIndex: inputs.inIndex,
      ...swapRequest,
    }),
  )
}

/** The complete call for the attested request's inputs, under a fresh mint nonce and a fresh change nonce. */
export function buildCompleteCall(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  inputs: SwapCompleteInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.swapV1
  return finalizeAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(vaultSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
      changeNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
  )
}

/** `prepareStartSwap`, the build, the finalisation and `startSwap`, as the swap panel runs them: a refusal at either server call is the result. */
export async function startSwapAsUser(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  swapRequest: SwapRequest,
): Promise<SwapResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.swapV1
  const prepared = await adaptor.prepareStartSwap(await user.login(), { swapRequest })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildStartCall(
    backend,
    vaultSecret,
    user,
    swapRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startSwap(await user.login(), {
    swapRequest,
    userCommitment: userCommitmentOf(vaultSecret),
    inIndex: prepared.inputs.inIndex,
    finalizedTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, startSwap answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteSwap`, the build, the finalisation and `completeSwap`, as the activity table's completion runs them. */
export async function completeSwapAsUser(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  name: string,
): Promise<SwapResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.swapV1
  const prepared = await adaptor.prepareCompleteSwap(await user.login(), { name })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildCompleteCall(
    backend,
    vaultSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeSwap(await user.login(), { name, finalizedTx })
  log(
    `complete call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, completeSwap answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
