import { hexToBytes } from '@sig-net/midnight'

import type {
  RedeemCompleteInputs,
  RedeemRequest,
  RedeemStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { RedeemResult } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import { bindAsUser, type BoundCallerCall, completionOutput, secretKeyOf } from './user-caller-call'
import type { UserWallet } from './user-wallet'

/** The start call for the server's slot and wrapper, with the caller secret as the witness, the user wallet's keys and its coin of the shares. */
export function buildStartCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  redeemRequest: RedeemRequest,
  inputs: RedeemStartInputs,
): Promise<BoundCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.redeemV1
  return bindAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      inIndex: inputs.inIndex,
      stataErc20Address: inputs.stataErc20Address,
      shares: redeemRequest.shares,
    }),
  )
}

/** The complete call for the attested request's inputs, under a fresh mint nonce. */
export function buildCompleteCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  inputs: RedeemCompleteInputs,
): Promise<BoundCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.redeemV1
  return bindAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(callerSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
  )
}

/** `prepareStartRedeem`, the build, the bind and `startRedeem`, as the lend panel runs them: a refusal at either server call is the result. */
export async function startRedeemAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  redeemRequest: RedeemRequest,
): Promise<RedeemResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.redeemV1
  const prepared = await adaptor.prepareStartRedeem(callerSecret, { redeemRequest })
  if (!prepared.ok) return prepared
  const { boundTx, buildMs, bindMs } = await buildStartCall(
    backend,
    callerSecret,
    user,
    redeemRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startRedeem(callerSecret, {
    redeemRequest,
    inIndex: prepared.inputs.inIndex,
    boundTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, bound in ${String(bindMs)} ms, startRedeem answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteRedeem`, the build, the bind and `completeRedeem`, as the activity table's completion runs them. */
export async function completeRedeemAsUser(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  name: string,
): Promise<RedeemResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.redeemV1
  const prepared = await adaptor.prepareCompleteRedeem(callerSecret, { name })
  if (!prepared.ok) return prepared
  const { boundTx, buildMs, bindMs } = await buildCompleteCall(
    backend,
    callerSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeRedeem(callerSecret, { name, boundTx })
  log(
    `complete call built in ${String(buildMs)} ms, bound in ${String(bindMs)} ms, completeRedeem answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
