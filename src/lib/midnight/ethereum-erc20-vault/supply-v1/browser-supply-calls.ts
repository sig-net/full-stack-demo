import { hexToBytes } from '@sig-net/midnight'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
import { userCommitmentOf } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'

/** Starts a supply from the page, the wallet's own coin of the pinned underlying funding the start call. */
export async function startSupplyInBrowser(args: StartSupplyInBrowserArgs): Promise<Supply> {
  const { actions, builder, wallet, login, vaultSecret, supplyRequest, onStage } = args
  const started = await runCallerCall({
    operation: 'supply',
    wallet,
    login,
    vaultSecret,
    onStage,
    prepare: async () => actions.prepareStartSupply(await login.credential(), { supplyRequest }),
    circuitArgs: ({ inIndex, underlyingErc20Address }, caller) => ({
      ...caller,
      inIndex,
      underlyingErc20Address,
      ...supplyRequest,
    }),
    build: (circuitArgs) => builder.buildStart(circuitArgs),
    record: async ({ inIndex }, finalizedTx) =>
      actions.startSupply(await login.credential(), {
        supplyRequest,
        userCommitment: userCommitmentOf(vaultSecret),
        inIndex,
        finalizedTx,
      }),
  })
  return started.supply
}

/** Completes an attested supply from the page, under a fresh mint nonce. */
export async function completeSupplyInBrowser(args: CompleteSupplyInBrowserArgs): Promise<Supply> {
  const { actions, builder, wallet, login, vaultSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'supply',
    wallet,
    login,
    vaultSecret,
    onStage,
    prepare: async () => actions.prepareCompleteSupply(await login.credential(), { name }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: async (_inputs, finalizedTx) =>
      actions.completeSupply(await login.credential(), { name, finalizedTx }),
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
    credential: LoginCredential,
    args: PrepareStartSupplyArgs,
  ): Promise<SupplyStartInputsResult>
  startSupply(credential: LoginCredential, args: StartSupplyArgs): Promise<SupplyResult>
  prepareCompleteSupply(
    credential: LoginCredential,
    args: PrepareCompleteSupplyArgs,
  ): Promise<SupplyCompleteInputsResult>
  completeSupply(credential: LoginCredential, args: CompleteSupplyArgs): Promise<SupplyResult>
}

export interface StartSupplyInBrowserArgs extends CallerCallArgs<SupplyCallBuilder> {
  readonly actions: Pick<SupplyActions, 'prepareStartSupply' | 'startSupply'>
  readonly supplyRequest: SupplyRequest
}

export interface CompleteSupplyInBrowserArgs extends CallerCallArgs<SupplyCallBuilder> {
  readonly actions: Pick<SupplyActions, 'prepareCompleteSupply' | 'completeSupply'>
  readonly name: string
}
