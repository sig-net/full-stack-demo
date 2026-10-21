import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallArgs,
  runCallerCall,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import type { Swap, SwapRequest } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import { SwapCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-call-builder'
import type {
  CompleteSwapArgs,
  PrepareCompleteSwapArgs,
  PrepareStartSwapArgs,
  StartSwapArgs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service'
import type {
  SwapCompleteInputsResult,
  SwapResult,
  SwapStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service-adaptor'
import { completionOutput } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'

/** Starts a swap from the page, the wallet's own coin of the sold token funding the start call. */
export async function startSwapInBrowser(args: StartSwapInBrowserArgs): Promise<Swap> {
  const { actions, builder, wallet, callerSecret, swapRequest, onStage } = args
  const started = await runCallerCall({
    operation: 'swap',
    wallet,
    callerSecret,
    onStage,
    prepare: () => actions.prepareStartSwap(callerSecret, { swapRequest }),
    circuitArgs: ({ inIndex }, caller) => ({ ...caller, inIndex, ...swapRequest }),
    build: (circuitArgs) => builder.buildStart(circuitArgs),
    record: ({ inIndex }, finalizedTx) =>
      actions.startSwap(callerSecret, { swapRequest, inIndex, finalizedTx }),
  })
  return started.swap
}

/** Completes an attested swap from the page, under a fresh mint nonce and a fresh change nonce. */
export async function completeSwapInBrowser(args: CompleteSwapInBrowserArgs): Promise<Swap> {
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'swap',
    wallet,
    callerSecret,
    onStage,
    prepare: () => actions.prepareCompleteSwap(callerSecret, { name }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
      changeNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: (_inputs, finalizedTx) => actions.completeSwap(callerSecret, { name, finalizedTx }),
  })
  return completed.swap
}

/** The builder over the page's providers, fetching the vault's prover keys from `origin`. */
export function browserSwapCallBuilder(config: ClientConfig, origin: string): SwapCallBuilder {
  const { providers, proofProvider } = browserVaultCallProviders(config, origin)
  return new SwapCallBuilder(providers, () => Promise.resolve(proofProvider))
}

/** The swap's server actions, as the page imports them. */
export interface SwapActions {
  prepareStartSwap(callerSecret: string, args: PrepareStartSwapArgs): Promise<SwapStartInputsResult>
  startSwap(callerSecret: string, args: StartSwapArgs): Promise<SwapResult>
  prepareCompleteSwap(
    callerSecret: string,
    args: PrepareCompleteSwapArgs,
  ): Promise<SwapCompleteInputsResult>
  completeSwap(callerSecret: string, args: CompleteSwapArgs): Promise<SwapResult>
}

export interface StartSwapInBrowserArgs extends CallerCallArgs<SwapCallBuilder> {
  readonly actions: Pick<SwapActions, 'prepareStartSwap' | 'startSwap'>
  readonly swapRequest: SwapRequest
}

export interface CompleteSwapInBrowserArgs extends CallerCallArgs<SwapCallBuilder> {
  readonly actions: Pick<SwapActions, 'prepareCompleteSwap' | 'completeSwap'>
  readonly name: string
}
