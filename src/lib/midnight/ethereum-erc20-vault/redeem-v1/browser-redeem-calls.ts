import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallStage,
  vaultRefusalOf,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/browser-caller-calls'
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
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/**
 * Starts a redeem from the page: the server assigns the call's slot and names the pinned
 * wrapper, the page builds, proves and binds the start call with the caller secret as its
 * witness and the wallet's own coin of the wrapper's shares, and the server records it for the
 * relayer to pay and submit. Every refusal is thrown with the server's message.
 */
export async function startRedeemInBrowser(args: StartRedeemInBrowserArgs): Promise<Redeem> {
  const { actions, builder, wallet, callerSecret, redeemRequest, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareStartRedeem(callerSecret, { redeemRequest })
  if (!prepared.ok) throw new Error(prepared.error)
  const { inIndex, stataErc20Address } = prepared.inputs
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildStart({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      inIndex,
      stataErc20Address,
      shares: redeemRequest.shares,
    }),
    'redeem',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const started = await actions.startRedeem(callerSecret, { redeemRequest, inIndex, boundTx })
  if (!started.ok) throw new Error(started.error)
  return started.redeem
}

/** Completes an attested redeem from the page as `startRedeemInBrowser` starts one. */
export async function completeRedeemInBrowser(args: CompleteRedeemInBrowserArgs): Promise<Redeem> {
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareCompleteRedeem(callerSecret, { name })
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
    'redeem',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const completed = await actions.completeRedeem(callerSecret, { name, boundTx })
  if (!completed.ok) throw new Error(completed.error)
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

interface RedeemCallArgs {
  readonly builder: RedeemCallBuilder
  readonly wallet: Wallet
  /** The stored identity secret, lower-case hex without `0x`, which is the call's witness. */
  readonly callerSecret: string
  readonly onStage?: (stage: CallerCallStage) => void
}

export interface StartRedeemInBrowserArgs extends RedeemCallArgs {
  readonly actions: Pick<RedeemActions, 'prepareStartRedeem' | 'startRedeem'>
  readonly redeemRequest: RedeemRequest
}

export interface CompleteRedeemInBrowserArgs extends RedeemCallArgs {
  readonly actions: Pick<RedeemActions, 'prepareCompleteRedeem' | 'completeRedeem'>
  readonly name: string
}
