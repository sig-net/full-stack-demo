import { hexToBytes } from '@sig-net/midnight'

import type {
  RedeemCompleteInputs,
  RedeemRequest,
  RedeemStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { RedeemResult } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import {
  completionOutput,
  finalizeAsUser,
  type FinalizedCallerCall,
  secretKeyOf,
} from './user-caller-call'
import type { UserWallet } from './user-wallet'

/** The start call for the server's slot and wrapper, with the vault secret as the witness, the user wallet's keys and its coin of the shares. */
export function buildStartCall(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  redeemRequest: RedeemRequest,
  inputs: RedeemStartInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.redeemV1
  return finalizeAsUser(user, () =>
    callBuilder.buildStart({
      secretKey: secretKeyOf(vaultSecret),
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
  vaultSecret: string,
  user: UserWallet,
  inputs: RedeemCompleteInputs,
): Promise<FinalizedCallerCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.redeemV1
  return finalizeAsUser(user, () =>
    callBuilder.buildComplete({
      secretKey: secretKeyOf(vaultSecret),
      wallet: user.publicKeys,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
  )
}

/** `prepareStartRedeem`, the build, the finalisation and `startRedeem`, as the lend panel runs them: a refusal at either server call is the result. */
export async function startRedeemAsUser(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  redeemRequest: RedeemRequest,
): Promise<RedeemResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.redeemV1
  const prepared = await adaptor.prepareStartRedeem(await user.login(), { redeemRequest })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildStartCall(
    backend,
    vaultSecret,
    user,
    redeemRequest,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.startRedeem(await user.login(), {
    redeemRequest,
    inIndex: prepared.inputs.inIndex,
    finalizedTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, startRedeem answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteRedeem`, the build, the finalisation and `completeRedeem`, as the activity table's completion runs them. */
export async function completeRedeemAsUser(
  backend: Backend,
  vaultSecret: string,
  user: UserWallet,
  name: string,
): Promise<RedeemResult> {
  const { adaptor } = backend.midnight.ethereumErc20Vault.redeemV1
  const prepared = await adaptor.prepareCompleteRedeem(await user.login(), { name })
  if (!prepared.ok) return prepared
  const { finalizedTx, buildMs, finalizeMs } = await buildCompleteCall(
    backend,
    vaultSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeRedeem(await user.login(), { name, finalizedTx })
  log(
    `complete call built in ${String(buildMs)} ms, finalised in ${String(finalizeMs)} ms, completeRedeem answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}
