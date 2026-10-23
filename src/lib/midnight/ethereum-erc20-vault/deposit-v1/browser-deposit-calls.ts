import { hexToBytes } from '@sig-net/midnight'

import type { ClientConfig } from '@/lib/config/client-config'
import { browserVaultCallProviders } from '@/lib/midnight/ethereum-erc20-vault/browser-vault-call-providers'
import {
  type CallerCallArgs,
  runCallerCall,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
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
import { userCommitmentOf } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'

/** Starts a deposit from the page, preparing and building the start call once more when the deposit account's nonce moved before the record. */
export async function startDepositInBrowser(args: StartDepositInBrowserArgs): Promise<Deposit> {
  const { actions, builder, wallet, callerAddress, vaultSecret, depositRequest, onStage } = args
  const userCommitment = userCommitmentOf(vaultSecret)
  const started = await runCallerCall(
    {
      operation: 'deposit',
      wallet,
      callerAddress,
      vaultSecret,
      onStage,
      prepare: () =>
        actions.prepareStartDeposit(callerAddress, {
          depositRequest,
          wallet: wallet.publicKeys,
          userCommitment,
        }),
      circuitArgs: (
        { inIndex, evmNonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas },
        caller,
      ) => ({
        ...caller,
        inIndex,
        evmNonce,
        gas: { gasLimit, maxFeePerGas, maxPriorityFeePerGas },
        erc20Address: depositRequest.erc20Address,
        amount: depositRequest.amount,
      }),
      build: (circuitArgs) => builder.buildStart(circuitArgs),
      record: ({ inIndex, evmNonce }, finalizedTx) =>
        actions.startDeposit(callerAddress, {
          depositRequest,
          wallet: wallet.publicKeys,
          userCommitment,
          inIndex,
          evmNonce,
          finalizedTx,
        }),
    },
    { retryOnce: (refusal) => refusal.reason === 'nonceConflict' },
  )
  return started.deposit
}

/** Completes an attested deposit from the page, under a fresh mint nonce. */
export async function completeDepositInBrowser(
  args: CompleteDepositInBrowserArgs,
): Promise<Deposit> {
  const { actions, builder, wallet, callerAddress, vaultSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'deposit',
    wallet,
    callerAddress,
    vaultSecret,
    onStage,
    prepare: () =>
      actions.prepareCompleteDeposit(callerAddress, { name, wallet: wallet.publicKeys }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: (_inputs, finalizedTx) =>
      actions.completeDeposit(callerAddress, { name, wallet: wallet.publicKeys, finalizedTx }),
  })
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
    callerAddress: string,
    args: PrepareStartDepositArgs,
  ): Promise<DepositStartInputsResult>
  startDeposit(callerAddress: string, args: StartDepositArgs): Promise<DepositResult>
  prepareCompleteDeposit(
    callerAddress: string,
    args: PrepareCompleteDepositArgs,
  ): Promise<DepositCompleteInputsResult>
  completeDeposit(callerAddress: string, args: CompleteDepositArgs): Promise<DepositResult>
}

export interface StartDepositInBrowserArgs extends CallerCallArgs<DepositCallBuilder> {
  readonly actions: Pick<DepositActions, 'prepareStartDeposit' | 'startDeposit'>
  readonly depositRequest: DepositRequest
}

export interface CompleteDepositInBrowserArgs extends CallerCallArgs<DepositCallBuilder> {
  readonly actions: Pick<DepositActions, 'prepareCompleteDeposit' | 'completeDeposit'>
  readonly name: string
}
