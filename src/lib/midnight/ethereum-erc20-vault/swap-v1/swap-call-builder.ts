import { evmAddressBytes, readVaultLedger } from '@sig-net/midnight-examples-erc20-vault-contract'

import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeSwapCallOptions,
  type CompleteSwapCircuitArgs,
  startSwapCallOptions,
  startFeeOf,
  type StartSwapCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A swap's start or complete call as unbound bytes. */
export class SwapCallBuilder extends CallerCallBuilder {
  /** The fee is read from the ledger just before the build, since the circuit asserts the coin against the fee the ledger holds when the call runs. */
  async buildStart(args: StartSwapCircuitArgs): Promise<string> {
    const state = await readVaultLedger(
      this.providers.publicDataProvider,
      this.providers.vaultAddress,
    )
    return this.prove(
      args,
      startSwapCallOptions(
        this.providers,
        args,
        startFeeOf(state, evmAddressBytes(args.erc20AddressIn), 'swap'),
      ),
    )
  }

  buildComplete(args: CompleteSwapCircuitArgs): Promise<string> {
    return this.prove(args, completeSwapCallOptions(this.providers, args))
  }
}
