import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallStage,
  vaultRefusalOf,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/browser-caller-calls'
import type {
  Deposit,
  DepositRequest,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { DepositCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-call-builder'
import type {
  CompleteDepositArgs,
  PrepareCompleteDepositArgs,
  PrepareStartDepositArgs,
  StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import type {
  DepositCompleteInputsResult,
  DepositResult,
  DepositStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import { completionOutput } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/**
 * Starts a deposit from the page: the server assigns the call's inputs, the page builds, proves
 * and binds the start call with the caller secret as its witness, and the server records it for
 * the relayer to pay and submit. A nonce that moved before the record is prepared and built
 * once more, and every other refusal is thrown with the server's message.
 */
export async function startDepositInBrowser(args: StartDepositInBrowserArgs): Promise<Deposit> {
  const first = await attemptStart(args)
  if (first.ok) return first.deposit
  if (first.reason !== 'nonceConflict') throw new Error(first.error)
  const second = await attemptStart(args)
  if (second.ok) return second.deposit
  throw new Error(second.error)
}

/** Completes an attested deposit from the page as `startDepositInBrowser` starts one, retrying nothing. */
export async function completeDepositInBrowser(
  args: CompleteDepositInBrowserArgs,
): Promise<Deposit> {
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareCompleteDeposit(callerSecret, {
    name,
    wallet: wallet.publicKeys,
  })
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
    'deposit',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  const completed = await actions.completeDeposit(callerSecret, {
    name,
    wallet: wallet.publicKeys,
    boundTx,
  })
  if (!completed.ok) throw new Error(completed.error)
  return completed.deposit
}

/** The builder over the page's providers, fetching the vault's prover keys from `origin`. */
export function browserDepositCallBuilder(
  config: ClientConfig,
  origin: string,
): DepositCallBuilder {
  const { providers, proofProvider } = browserVaultCallProviders(config, origin)
  return new DepositCallBuilder(providers, () => Promise.resolve(proofProvider))
}

/** The deposit's server actions, as the page imports them. */
export interface DepositActions {
  prepareStartDeposit(
    callerSecret: string,
    args: PrepareStartDepositArgs,
  ): Promise<DepositStartInputsResult>
  startDeposit(callerSecret: string, args: StartDepositArgs): Promise<DepositResult>
  prepareCompleteDeposit(
    callerSecret: string,
    args: PrepareCompleteDepositArgs,
  ): Promise<DepositCompleteInputsResult>
  completeDeposit(callerSecret: string, args: CompleteDepositArgs): Promise<DepositResult>
}

interface DepositCallArgs {
  readonly builder: DepositCallBuilder
  readonly wallet: Wallet
  /** The stored identity secret, lower-case hex without `0x`, which is the call's witness. */
  readonly callerSecret: string
  readonly onStage?: (stage: CallerCallStage) => void
}

export interface StartDepositInBrowserArgs extends DepositCallArgs {
  readonly actions: Pick<DepositActions, 'prepareStartDeposit' | 'startDeposit'>
  readonly depositRequest: DepositRequest
}

export interface CompleteDepositInBrowserArgs extends DepositCallArgs {
  readonly actions: Pick<DepositActions, 'prepareCompleteDeposit' | 'completeDeposit'>
  readonly name: string
}

/** One pass from prepare to record, answering with the server's result. */
async function attemptStart(args: StartDepositInBrowserArgs): Promise<DepositResult> {
  const { actions, builder, wallet, callerSecret, depositRequest, onStage } = args
  onStage?.('preparing')
  const prepared = await actions.prepareStartDeposit(callerSecret, {
    depositRequest,
    wallet: wallet.publicKeys,
  })
  if (!prepared.ok) return prepared
  const { inIndex, evmNonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas } = prepared.inputs
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    builder.buildStart({
      secretKey: hexToBytes(callerSecret),
      wallet: wallet.publicKeys,
      inIndex,
      evmNonce,
      gas: { gasLimit, maxFeePerGas, maxPriorityFeePerGas },
      erc20Address: depositRequest.erc20Address,
      amount: depositRequest.amount,
    }),
    'deposit',
  )
  onStage?.('signing')
  const boundTx = await wallet.balanceWithoutFee(unboundTx)
  onStage?.('recording')
  return actions.startDeposit(callerSecret, {
    depositRequest,
    wallet: wallet.publicKeys,
    inIndex,
    evmNonce,
    boundTx,
  })
}
