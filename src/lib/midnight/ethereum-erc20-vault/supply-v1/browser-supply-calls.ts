import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallArgs,
  runCallerCall,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
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

/** Starts a supply from the page, the wallet's own coin of the pinned underlying funding the start call. */
export async function startSupplyInBrowser(args: StartSupplyInBrowserArgs): Promise<Supply> {
  const { actions, builder, wallet, callerAddress, vaultSecret, supplyRequest, onStage } = args
  const started = await runCallerCall({
    operation: 'supply',
    wallet,
    callerAddress,
    vaultSecret,
    onStage,
    prepare: () => actions.prepareStartSupply(callerAddress, { supplyRequest }),
    circuitArgs: ({ inIndex, underlyingErc20Address }, caller) => ({
      ...caller,
      inIndex,
      underlyingErc20Address,
      ...supplyRequest,
    }),
    build: (circuitArgs) => builder.buildStart(circuitArgs),
    record: ({ inIndex }, finalizedTx) =>
      actions.startSupply(callerAddress, { supplyRequest, inIndex, finalizedTx }),
  })
  return started.supply
}

/** Completes an attested supply from the page, under a fresh mint nonce. */
export async function completeSupplyInBrowser(args: CompleteSupplyInBrowserArgs): Promise<Supply> {
  const { actions, builder, wallet, callerAddress, vaultSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'supply',
    wallet,
    callerAddress,
    vaultSecret,
    onStage,
    prepare: () => actions.prepareCompleteSupply(callerAddress, { name }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: (_inputs, finalizedTx) => actions.completeSupply(callerAddress, { name, finalizedTx }),
  })
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
    callerAddress: string,
    args: PrepareStartSupplyArgs,
  ): Promise<SupplyStartInputsResult>
  startSupply(callerAddress: string, args: StartSupplyArgs): Promise<SupplyResult>
  prepareCompleteSupply(
    callerAddress: string,
    args: PrepareCompleteSupplyArgs,
  ): Promise<SupplyCompleteInputsResult>
  completeSupply(callerAddress: string, args: CompleteSupplyArgs): Promise<SupplyResult>
}

export interface StartSupplyInBrowserArgs extends CallerCallArgs<SupplyCallBuilder> {
  readonly actions: Pick<SupplyActions, 'prepareStartSupply' | 'startSupply'>
  readonly supplyRequest: SupplyRequest
}

export interface CompleteSupplyInBrowserArgs extends CallerCallArgs<SupplyCallBuilder> {
  readonly actions: Pick<SupplyActions, 'prepareCompleteSupply' | 'completeSupply'>
  readonly name: string
}
