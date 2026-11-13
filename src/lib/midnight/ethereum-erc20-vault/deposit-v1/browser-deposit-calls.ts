import { hexToBytes } from '@sig-net/midnight'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
  const { actions, builder, wallet, login, vaultSecret, depositRequest, onStage } = args
  const userCommitment = userCommitmentOf(vaultSecret)
  const started = await runCallerCall(
    {
      operation: 'deposit',
      wallet,
      login,
      vaultSecret,
      onStage,
      prepare: async () =>
        actions.prepareStartDeposit(await login.credential(), {
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
      record: async ({ inIndex, evmNonce }, finalizedTx) =>
        actions.startDeposit(await login.credential(), {
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
  const { actions, builder, wallet, login, vaultSecret, name, onStage } = args
  const completed = await runCallerCall({
    operation: 'deposit',
    wallet,
    login,
    vaultSecret,
    onStage,
    prepare: async () =>
      actions.prepareCompleteDeposit(await login.credential(), { name, wallet: wallet.publicKeys }),
    circuitArgs: (inputs, caller) => ({
      ...caller,
      requestId: hexToBytes(inputs.requestId),
      serializedOutput: completionOutput(inputs, 1),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    build: (circuitArgs) => builder.buildComplete(circuitArgs),
    record: async (_inputs, finalizedTx) =>
      actions.completeDeposit(await login.credential(), {
        name,
        wallet: wallet.publicKeys,
        finalizedTx,
      }),
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
    credential: LoginCredential,
    args: PrepareStartDepositArgs,
  ): Promise<DepositStartInputsResult>
  startDeposit(credential: LoginCredential, args: StartDepositArgs): Promise<DepositResult>
  prepareCompleteDeposit(
    credential: LoginCredential,
    args: PrepareCompleteDepositArgs,
  ): Promise<DepositCompleteInputsResult>
  completeDeposit(credential: LoginCredential, args: CompleteDepositArgs): Promise<DepositResult>
}

export interface StartDepositInBrowserArgs extends CallerCallArgs<DepositCallBuilder> {
  readonly actions: Pick<DepositActions, 'prepareStartDeposit' | 'startDeposit'>
  readonly depositRequest: DepositRequest
}

export interface CompleteDepositInBrowserArgs extends CallerCallArgs<DepositCallBuilder> {
  readonly actions: Pick<DepositActions, 'prepareCompleteDeposit' | 'completeDeposit'>
  readonly name: string
}
