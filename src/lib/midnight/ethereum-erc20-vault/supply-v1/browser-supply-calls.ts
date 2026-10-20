import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallStage,
  vaultRefusalOf,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/browser-caller-calls'
import type { Supply, SupplyRequest } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import { SupplyCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-call-builder'
import type {
  CompleteSupplyArgs,
  PrepareCompleteSupplyArgs,
  PrepareStartSupplyArgs,
  StartSupplyArgs,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import type {
  SupplyCompleteInputsResult,
  SupplyResult,
  SupplyStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service-adaptor'
import { completionOutput } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/**
 * Starts a supply from the page: the server assigns the call's slot and names the pinned
 * underlying, the page builds, proves and binds the start call with the caller secret as its
 * witness and the wallet's own coin of the underlying, and the server records it for the relayer
 * to pay and submit. Every refusal is thrown with the server's message.
 */
export async function startSupplyInBrowser(args: StartSupplyInBrowserArgs): Promise<Supply> {
  const { actions, builder, wallet, callerSecret, supplyRequest, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareStartSupply(callerSecret, { supplyRequest })
  if (!prepared.ok) throw new Error(prepared.error)
  const { inIndex, underlyingErc20Address } = prepared.inputs
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildStart({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      inIndex,
      underlyingErc20Address,
      ...supplyRequest,
    }),
    'supply',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const started = await actions.startSupply(callerSecret, { supplyRequest, inIndex, boundTx })
  if (!started.ok) throw new Error(started.error)
  return started.supply
}

/** Completes an attested supply from the page as `startSupplyInBrowser` starts one. */
export async function completeSupplyInBrowser(args: CompleteSupplyInBrowserArgs): Promise<Supply> {
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareCompleteSupply(callerSecret, { name })
  if (!prepared.ok) throw new Error(prepared.error)
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildComplete({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      requestId: hexToBytes(prepared.inputs.requestId),
      serializedOutput: completionOutput(prepared.inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    'supply',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const completed = await actions.completeSupply(callerSecret, { name, boundTx })
  if (!completed.ok) throw new Error(completed.error)
  return completed.supply
}

/** The builder over the page's providers, fetching the vault's prover keys from `origin`. */
export function browserSupplyCallBuilder(config: ClientConfig, origin: string): SupplyCallBuilder {
  const { providers, proofProvider } = browserVaultCallProviders(config, origin)
  return new SupplyCallBuilder(providers, () => Promise.resolve(proofProvider))
}

/** The supply's server actions, as the page imports them. */
export interface SupplyActions {
  prepareStartSupply(
    callerSecret: string,
    args: PrepareStartSupplyArgs,
  ): Promise<SupplyStartInputsResult>
  startSupply(callerSecret: string, args: StartSupplyArgs): Promise<SupplyResult>
  prepareCompleteSupply(
    callerSecret: string,
    args: PrepareCompleteSupplyArgs,
  ): Promise<SupplyCompleteInputsResult>
  completeSupply(callerSecret: string, args: CompleteSupplyArgs): Promise<SupplyResult>
}

interface SupplyCallArgs {
  readonly builder: SupplyCallBuilder
  readonly wallet: Wallet
  /** The stored identity secret, lower-case hex without `0x`, which is the call's witness. */
  readonly callerSecret: string
  readonly onStage?: (stage: CallerCallStage) => void
}

export interface StartSupplyInBrowserArgs extends SupplyCallArgs {
  readonly actions: Pick<SupplyActions, 'prepareStartSupply' | 'startSupply'>
  readonly supplyRequest: SupplyRequest
}

export interface CompleteSupplyInBrowserArgs extends SupplyCallArgs {
  readonly actions: Pick<SupplyActions, 'prepareCompleteSupply' | 'completeSupply'>
  readonly name: string
}
