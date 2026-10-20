import { hexToBytes } from '@sig-net/midnight'

import type {
  SwapCompleteInputs,
  SwapRequest,
  SwapStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { SwapResult } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import { bindAsUser, type BoundCallerCall, completionOutput, secretKeyOf } from './user-caller-call'
import type { UserWallet } from './user-wallet'

/** The start call for the server's slot, with the caller secret as the witness, the user wallet's keys and its coin of the sold token. */
export function buildStartCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  swapRequest: SwapRequest,
  inputs: SwapStartInputs,
): Promise<BoundCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.swapV1
  return bindAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      inIndex: inputs.inIndex,
      ...swapRequest,
    }),
  )
}

/** The complete call for the attested request's inputs, under a fresh mint nonce and a fresh change nonce. */
export function buildCompleteCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  inputs: SwapCompleteInputs,
): Promise<BoundCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.swapV1
  return bindAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
      changeNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
  )
}

/** `prepareStartSwap`, the build, the bind and `startSwap`, as the swap panel runs them: a refusal at either server call is the result. */
export async function startSwapAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  swapRequest: SwapRequest,
): Promise<SwapResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.swapV1
  const prepared = await adaptor.prepareStartSwap(callerSecret, { swapRequest })
  if (!prepared.ok) return prepared
  const { boundTx, buildMs, bindMs } = await buildStartCall(
    backend,
    callerSecret,
    user,
    swapRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startSwap(callerSecret, {
    swapRequest,
    inIndex: prepared.inputs.inIndex,
    boundTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, bound in ${String(bindMs)} ms, startSwap answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteSwap`, the build, the bind and `completeSwap`, as the activity table's completion runs them. */
export async function completeSwapAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  name: string,
): Promise<SwapResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.swapV1
  const prepared = await adaptor.prepareCompleteSwap(callerSecret, { name })
  if (!prepared.ok) return prepared
  const { boundTx, buildMs, bindMs } = await buildCompleteCall(
    backend,
    callerSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeSwap(callerSecret, { name, boundTx })
  log(
    `complete call built in ${String(buildMs)} ms, bound in ${String(bindMs)} ms, completeSwap answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
