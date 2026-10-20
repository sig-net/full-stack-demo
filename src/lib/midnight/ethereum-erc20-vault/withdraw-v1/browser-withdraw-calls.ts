import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallStage,
  vaultRefusalOf,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/browser-caller-calls'
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
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/**
 * Starts a withdrawal from the page: the server assigns the call's slot, the page builds, proves
 * and binds the start call with the caller secret as its witness and the wallet's own coin of
 * the sent token, and the server records it for the relayer to pay and submit. Every refusal is
 * thrown with the server's message.
 */
export async function startWithdrawInBrowser(args: StartWithdrawInBrowserArgs): Promise<Withdraw> {
  const { actions, builder, wallet, callerSecret, withdrawRequest, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareStartWithdraw(callerSecret, { withdrawRequest })
  if (!prepared.ok) throw new Error(prepared.error)
  const { inIndex } = prepared.inputs
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildStart({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      inIndex,
      ...withdrawRequest,
    }),
    'send',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const started = await actions.startWithdraw(callerSecret, { withdrawRequest, inIndex, boundTx })
  if (!started.ok) throw new Error(started.error)
  return started.withdraw
}

/** Completes an attested withdrawal from the page as `startWithdrawInBrowser` starts one. */
export async function completeWithdrawInBrowser(
  args: CompleteWithdrawInBrowserArgs,
): Promise<Withdraw> {
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareCompleteWithdraw(callerSecret, { name })
  if (!prepared.ok) throw new Error(prepared.error)
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildComplete({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      requestId: hexToBytes(prepared.inputs.requestId),
      serializedOutput: completionOutput(prepared.inputs, 1),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    'send',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const completed = await actions.completeWithdraw(callerSecret, { name, boundTx })
  if (!completed.ok) throw new Error(completed.error)
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
    callerSecret: string,
    args: PrepareStartWithdrawArgs,
  ): Promise<WithdrawStartInputsResult>
  startWithdraw(callerSecret: string, args: StartWithdrawArgs): Promise<WithdrawResult>
  prepareCompleteWithdraw(
    callerSecret: string,
    args: PrepareCompleteWithdrawArgs,
  ): Promise<WithdrawCompleteInputsResult>
  completeWithdraw(callerSecret: string, args: CompleteWithdrawArgs): Promise<WithdrawResult>
}

interface WithdrawCallArgs {
  readonly builder: WithdrawCallBuilder
  readonly wallet: Wallet
  /** The stored identity secret, lower-case hex without `0x`, which is the call's witness. */
  readonly callerSecret: string
  readonly onStage?: (stage: CallerCallStage) => void
}

export interface StartWithdrawInBrowserArgs extends WithdrawCallArgs {
  readonly actions: Pick<WithdrawActions, 'prepareStartWithdraw' | 'startWithdraw'>
  readonly withdrawRequest: WithdrawRequest
}

export interface CompleteWithdrawInBrowserArgs extends WithdrawCallArgs {
  readonly actions: Pick<WithdrawActions, 'prepareCompleteWithdraw' | 'completeWithdraw'>
  readonly name: string
}
