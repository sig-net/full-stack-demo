import { readVaultLedger } from '@sig-net/midnight-examples-erc20-vault-contract'

import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeSupplyCallOptions,
  type CompleteSupplyCircuitArgs,
  startSupplyCallOptions,
  startFeeOf,
  type StartSupplyCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A supply's start or complete call as unbound bytes. */
export class SupplyCallBuilder extends CallerCallBuilder {
  /** The fee is read from the ledger just before the build, since the circuit asserts the coin against the fee the ledger holds when the call runs. */
  async buildStart(args: StartSupplyCircuitArgs): Promise<string> {
    const state = await readVaultLedger(
      this.providers.publicDataProvider,
      this.providers.vaultAddress,
    )
    return this.prove(
      args,
      startSupplyCallOptions(
        this.providers,
        args,
        startFeeOf(state, state.stataUnderlying, 'supply'),
      ),
    )
  }

  buildComplete(args: CompleteSupplyCircuitArgs): Promise<string> {
    return this.prove(args, completeSupplyCallOptions(this.providers, args))
  }
}
