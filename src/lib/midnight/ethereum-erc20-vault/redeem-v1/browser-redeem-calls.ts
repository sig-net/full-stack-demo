import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallArgs,
  runCallerCall,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import type { Redeem, RedeemRequest } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import { RedeemCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-call-builder'
import type {
  CompleteRedeemArgs,
  PrepareCompleteRedeemArgs,
  PrepareStartRedeemArgs,
  StartRedeemArgs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service'
import type {
  RedeemCompleteInputsResult,
  RedeemResult,
  RedeemStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-adaptor'
import { completionOutput } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'

/** Starts a redeem from the page, the wallet's own coin of the pinned wrapper's shares funding the start call. */
export async function startRedeemInBrowser(args: StartRedeemInBrowserArgs): Promise<Redeem> {
  const { actions, builder, wallet, callerSecret, redeemRequest, onStage } = args
  const started = await runCallerCall({
    operation: 'redeem',
    wallet,
    callerSecret,
    onStage,
    prepare: () => actions.prepareStartRedeem(callerSecret, { redeemRequest }),
    circuitArgs: ({ inIndex, stataErc20Address }, caller) => ({
      ...caller,
      inIndex,
      stataErc20Address,
      shares: redeemRequest.shares,
    }),
    build: (circuitArgs) => builder.buildStart(circuitArgs),
    record: ({ inIndex }, finalizedTx) =>
      actions.startRedeem(callerSecret, { redeemRequest, inIndex, finalizedTx }),
  })
  return started.redeem
}

/** Completes an attested redeem from the page, under a fresh mint nonce. */
export async function completeRedeemInBrowser(args: CompleteRedeemInBrowserArgs): Promise<Redeem> {
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'redeem',
    wallet,
    callerSecret,
    onStage,
    prepare: () => actions.prepareCompleteRedeem(callerSecret, { name }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 32),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: (_inputs, finalizedTx) => actions.completeRedeem(callerSecret, { name, finalizedTx }),
  })
  return completed.redeem
}

/** The builder over the page's providers, fetching the vault's prover keys from `origin`. */
export function browserRedeemCallBuilder(config: ClientConfig, origin: string): RedeemCallBuilder {
  const { providers, proofProvider } = browserVaultCallProviders(config, origin)
  return new RedeemCallBuilder(providers, () => Promise.resolve(proofProvider))
}

/** The redeem's server actions, as the page imports them. */
export interface RedeemActions {
  prepareStartRedeem(
    callerSecret: string,
    args: PrepareStartRedeemArgs,
  ): Promise<RedeemStartInputsResult>
  startRedeem(callerSecret: string, args: StartRedeemArgs): Promise<RedeemResult>
  prepareCompleteRedeem(
    callerSecret: string,
    args: PrepareCompleteRedeemArgs,
  ): Promise<RedeemCompleteInputsResult>
  completeRedeem(callerSecret: string, args: CompleteRedeemArgs): Promise<RedeemResult>
}

export interface StartRedeemInBrowserArgs extends CallerCallArgs<RedeemCallBuilder> {
  readonly actions: Pick<RedeemActions, 'prepareStartRedeem' | 'startRedeem'>
  readonly redeemRequest: RedeemRequest
}

export interface CompleteRedeemInBrowserArgs extends CallerCallArgs<RedeemCallBuilder> {
  readonly actions: Pick<RedeemActions, 'prepareCompleteRedeem' | 'completeRedeem'>
  readonly name: string
}
