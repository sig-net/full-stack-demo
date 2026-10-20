import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallStage,
  vaultRefusalOf,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/browser-caller-calls'
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
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/**
 * Starts a swap from the page: the server assigns the call's slot, the page builds, proves and
 * binds the start call with the caller secret as its witness and the wallet's own coin of the
 * sold token, and the server records it for the relayer to pay and submit. Every refusal is
 * thrown with the server's message.
 */
export async function startSwapInBrowser(args: StartSwapInBrowserArgs): Promise<Swap> {
  const { actions, builder, wallet, callerSecret, swapRequest, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareStartSwap(callerSecret, { swapRequest })
  if (!prepared.ok) throw new Error(prepared.error)
  const { inIndex } = prepared.inputs
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildStart({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      inIndex,
      ...swapRequest,
    }),
    'swap',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const started = await actions.startSwap(callerSecret, { swapRequest, inIndex, boundTx })
  if (!started.ok) throw new Error(started.error)
  return started.swap
}

/** Completes an attested swap from the page as `startSwapInBrowser` starts one. */
export async function completeSwapInBrowser(args: CompleteSwapInBrowserArgs): Promise<Swap> {
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareCompleteSwap(callerSecret, { name })
  if (!prepared.ok) throw new Error(prepared.error)
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildComplete({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      requestId: hexToBytes(prepared.inputs.requestId),
      serializedOutput: completionOutput(prepared.inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
      changeNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    'swap',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const completed = await actions.completeSwap(callerSecret, { name, boundTx })
  if (!completed.ok) throw new Error(completed.error)
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

interface SwapCallArgs {
  readonly builder: SwapCallBuilder
  readonly wallet: Wallet
  /** The stored identity secret, lower-case hex without `0x`, which is the call's witness. */
  readonly callerSecret: string
  readonly onStage?: (stage: CallerCallStage) => void
}

export interface StartSwapInBrowserArgs extends SwapCallArgs {
  readonly actions: Pick<SwapActions, 'prepareStartSwap' | 'startSwap'>
  readonly swapRequest: SwapRequest
}

export interface CompleteSwapInBrowserArgs extends SwapCallArgs {
  readonly actions: Pick<SwapActions, 'prepareCompleteSwap' | 'completeSwap'>
  readonly name: string
}
