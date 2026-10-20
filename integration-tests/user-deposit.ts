import { hexToBytes } from '@sig-net/midnight'

import type {
  DepositCompleteInputs,
  DepositRequest,
  DepositStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { DepositResult } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import type { Backend } from '@/server/backend'

import { log } from './operation-round-trip'
import type { UserWallet } from './user-wallet'

/**
 * A deposit call as the browser plays it: built and proved through the backend's own builder,
 * then balanced, signed and bound by the user wallet without a fee, with how long each took.
 */
export interface BoundDepositCall {
  readonly boundTx: string
  readonly buildMs: number
  readonly bindMs: number
}

/** The start call for the server's assignment, with the caller secret as the witness and the user wallet's keys. */
export async function buildStartCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  depositRequest: DepositRequest,
  inputs: DepositStartInputs,
): Promise<BoundDepositCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.depositV1
  const building = Date.now()
  const unboundTx = await callBuilder.buildStart({
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
  })
  const binding = Date.now()
  const boundTx = await user.balanceWithoutFee(unboundTx)
  return { boundTx, buildMs: binding - building, bindMs: Date.now() - binding }
}

/** The complete call for the attested request's inputs, under a fresh mint nonce. */
export async function buildCompleteCall(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  inputs: DepositCompleteInputs,
): Promise<BoundDepositCall> {
  const { callBuilder } = backend.midnight.ethereumErc20Vault.depositV1
  const building = Date.now()
  const unboundTx = await callBuilder.buildComplete({
    secretKey: secretKeyOf(callerSecret),
    wallet: user.publicKeys,
    requestId: hexToBytes(inputs.requestId),
    serializedOutput: completionOutput(inputs),
    mintNonce: crypto.getRandomValues(new Uint8Array(32)),
  })
  const binding = Date.now()
  const boundTx = await user.balanceWithoutFee(unboundTx)
  return { boundTx, buildMs: binding - building, bindMs: Date.now() - binding }
}

/** `prepareStartDeposit`, the build, the bind and `startDeposit`, as the deposit dialog runs them: a refusal at either server call is the result. */
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
  const { boundTx, buildMs, bindMs } = await buildStartCall(
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
    boundTx,
  })
  log(
    `start call built in ${String(buildMs)} ms, bound in ${String(bindMs)} ms, startDeposit answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** `prepareCompleteDeposit`, the build, the bind and `completeDeposit`, as the activity table's completion runs them. */
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
  const { boundTx, buildMs, bindMs } = await buildCompleteCall(
    backend,
    callerSecret,
    user,
    prepared.inputs,
  )
  const calling = Date.now()
  const result = await adaptor.completeDeposit(callerSecret, { name, wallet, boundTx })
  log(
    `complete call built in ${String(buildMs)} ms, bound in ${String(bindMs)} ms, completeDeposit answered in ${String(Date.now() - calling)} ms`,
  )
  return result
}

/** Mirrors `completionOutput` in `vault-request-attestation.ts` for the deposit circuit's one-byte output: an integration test imports nothing from `src` at runtime but `getBackend()`. */
function completionOutput(inputs: DepositCompleteInputs): Uint8Array {
  return inputs.attestationOutputKind === 'executed'
    ? hexToBytes(inputs.attestationOutput)
    : new Uint8Array([0])
}

/** The witness bytes of a caller secret in hex, as the server derives them from the same secret. */
function secretKeyOf(callerSecret: string): Uint8Array {
  return hexToBytes(callerSecret.replace(/^0x/i, ''))
}
