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
  type VaultCallProviders,
  type VaultContract,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/**
 * Builds a caller circuit call as unbound bytes (proven and unbalanced) in any runtime holding
 * the caller secret: the unproven bytes, which embed the witness, never leave the building
 * method. Each operation's builder names its circuits over this one `prove`.
 */
export class CallerCallBuilder {
  protected readonly providers: VaultCallProviders
  private readonly proofProvider: () => Promise<ProofProvider>

  /** The proof provider is reached through a function so that a key registry loads on first use. */
  constructor(providers: VaultCallProviders, proofProvider: () => Promise<ProofProvider>) {
    this.providers = providers
    this.proofProvider = proofProvider
  }

  protected async prove<Circuit extends VaultCircuitId>(
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
