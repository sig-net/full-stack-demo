import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallArgs,
  runCallerCall,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import { completionOutput } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type {
  Withdraw,
  WithdrawRequest,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import { WithdrawCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-call-builder'
import type {
  CompleteWithdrawArgs,
  PrepareCompleteWithdrawArgs,
  PrepareStartWithdrawArgs,
  StartWithdrawArgs,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service'
import type {
  WithdrawCompleteInputsResult,
  WithdrawResult,
  WithdrawStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-service-adaptor'

/** Starts a withdrawal from the page, the wallet's own coin of the sent token funding the start call. */
export async function startWithdrawInBrowser(args: StartWithdrawInBrowserArgs): Promise<Withdraw> {
  const { actions, builder, wallet, callerAddress, vaultSecret, withdrawRequest, onStage } = args
  const started = await runCallerCall({
    operation: 'send',
    wallet,
    callerAddress,
    vaultSecret,
    onStage,
    prepare: () => actions.prepareStartWithdraw(callerAddress, { withdrawRequest }),
    circuitArgs: ({ inIndex }, caller) => ({ ...caller, inIndex, ...withdrawRequest }),
    build: (circuitArgs) => builder.buildStart(circuitArgs),
    record: ({ inIndex }, finalizedTx) =>
      actions.startWithdraw(callerAddress, { withdrawRequest, inIndex, finalizedTx }),
  })
  return started.withdraw
}

/** Completes an attested withdrawal from the page, under a fresh mint nonce. */
export async function completeWithdrawInBrowser(
  args: CompleteWithdrawInBrowserArgs,
): Promise<Withdraw> {
  const { actions, builder, wallet, callerAddress, vaultSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'send',
    wallet,
    callerAddress,
    vaultSecret,
    onStage,
    prepare: () => actions.prepareCompleteWithdraw(callerAddress, { name }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: (_inputs, finalizedTx) =>
      actions.completeWithdraw(callerAddress, { name, finalizedTx }),
  })
  return completed.withdraw
}

/** The builder over the page's providers, fetching the vault's prover keys from `origin`. */
export function browserWithdrawCallBuilder(
  config: ClientConfig,
  origin: string,
): WithdrawCallBuilder {
  const { providers, proofProvider } = browserVaultCallProviders(config, origin)
  return new WithdrawCallBuilder(providers, () => Promise.resolve(proofProvider))
}

/** The withdraw's server actions, as the page imports them. */
export interface WithdrawActions {
  prepareStartWithdraw(
    callerAddress: string,
    args: PrepareStartWithdrawArgs,
  ): Promise<WithdrawStartInputsResult>
  startWithdraw(callerAddress: string, args: StartWithdrawArgs): Promise<WithdrawResult>
  prepareCompleteWithdraw(
    callerAddress: string,
    args: PrepareCompleteWithdrawArgs,
  ): Promise<WithdrawCompleteInputsResult>
  completeWithdraw(callerAddress: string, args: CompleteWithdrawArgs): Promise<WithdrawResult>
}

export interface StartWithdrawInBrowserArgs extends CallerCallArgs<WithdrawCallBuilder> {
  readonly actions: Pick<WithdrawActions, 'prepareStartWithdraw' | 'startWithdraw'>
  readonly withdrawRequest: WithdrawRequest
}

export interface CompleteWithdrawInBrowserArgs extends CallerCallArgs<WithdrawCallBuilder> {
  readonly actions: Pick<WithdrawActions, 'prepareCompleteWithdraw' | 'completeWithdraw'>
  readonly name: string
}
