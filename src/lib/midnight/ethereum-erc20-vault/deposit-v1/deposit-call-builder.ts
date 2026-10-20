import type { CallTxOptions } from '@midnight-ntwrk/midnight-js/contracts'
import type { ProofProvider } from '@midnight-ntwrk/midnight-js/types'
import {
  createVaultPrivateState,
  type VaultCircuitId,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import { proveTransaction } from '@/lib/midnight/transaction-v1/prove-transaction'
import {
  buildVaultCall,
  type CallerCircuitArgs,
  completeDepositCallOptions,
  type CompleteDepositCircuitArgs,
  startDepositCallOptions,
  type StartDepositCircuitArgs,
  type VaultCallProviders,
  type VaultContract,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/**
 * Builds a deposit's start or complete call as unbound bytes (proven and unbalanced) in any
 * runtime holding the caller secret: the unproven bytes, which embed the witness, never leave
 * the building method.
 */
export class DepositCallBuilder {
  private readonly providers: VaultCallProviders
  private readonly proofProvider: () => Promise<ProofProvider>

  /** The proof provider is reached through a function so that a key registry loads on first use. */
  constructor(providers: VaultCallProviders, proofProvider: () => Promise<ProofProvider>) {
    this.providers = providers
    this.proofProvider = proofProvider
  }

  buildStart(args: StartDepositCircuitArgs): Promise<string> {
    return this.prove(args, startDepositCallOptions(this.providers, args))
  }

  buildComplete(args: CompleteDepositCircuitArgs): Promise<string> {
    return this.prove(args, completeDepositCallOptions(this.providers, args))
  }

  private async prove<Circuit extends VaultCircuitId>(
    args: CallerCircuitArgs,
    options: CallTxOptions<VaultContract, Circuit>,
  ): Promise<string> {
    return proveTransaction(
      await this.proofProvider(),
      await buildVaultCall(
        this.providers,
        createVaultPrivateState(args.secretKey),
        args.wallet,
        options,
      ),
    )
  }
}
