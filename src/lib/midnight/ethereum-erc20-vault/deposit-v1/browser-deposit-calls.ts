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

/** Starts a deposit from the page, preparing and building the start call once more when the deposit account's nonce moved before the record. */
export async function startDepositInBrowser(args: StartDepositInBrowserArgs): Promise<Deposit> {
  const { actions, builder, wallet, callerSecret, depositRequest, onStage } = args
  const started = await runCallerCall(
    {
      operation: 'deposit',
      wallet,
      callerSecret,
      onStage,
      prepare: () =>
        actions.prepareStartDeposit(callerSecret, { depositRequest, wallet: wallet.publicKeys }),
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
        actions.startDeposit(callerSecret, {
          depositRequest,
          wallet: wallet.publicKeys,
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
  const { actions, builder, wallet, callerSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'deposit',
    wallet,
    callerSecret,
    onStage,
    prepare: () =>
      actions.prepareCompleteDeposit(callerSecret, { name, wallet: wallet.publicKeys }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: (_inputs, finalizedTx) =>
      actions.completeDeposit(callerSecret, { name, wallet: wallet.publicKeys, finalizedTx }),
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

export interface StartDepositInBrowserArgs extends CallerCallArgs<DepositCallBuilder> {
  readonly actions: Pick<DepositActions, 'prepareStartDeposit' | 'startDeposit'>
  readonly depositRequest: DepositRequest
}

export interface CompleteDepositInBrowserArgs extends CallerCallArgs<DepositCallBuilder> {
  readonly actions: Pick<DepositActions, 'prepareCompleteDeposit' | 'completeDeposit'>
  readonly name: string
}
