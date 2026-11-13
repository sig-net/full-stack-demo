import { evmAddressBytes, readVaultLedger } from '@sig-net/midnight-examples-erc20-vault-contract'

import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeWithdrawCallOptions,
  type CompleteWithdrawCircuitArgs,
  startWithdrawCallOptions,
  startFeeOf,
  type StartWithdrawCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A withdrawal's start or complete call as unbound bytes. */
export class WithdrawCallBuilder extends CallerCallBuilder {
  /** The fee is read from the ledger just before the build, since the circuit asserts the coin against the fee the ledger holds when the call runs. */
  async buildStart(args: StartWithdrawCircuitArgs): Promise<string> {
    const state = await readVaultLedger(
      this.providers.publicDataProvider,
      this.providers.vaultAddress,
    )
    return this.prove(
      args,
      startWithdrawCallOptions(
        this.providers,
        args,
        startFeeOf(state, evmAddressBytes(args.erc20Address), 'withdraw'),
      ),
    )
  }

  buildComplete(args: CompleteWithdrawCircuitArgs): Promise<string> {
    return this.prove(args, completeWithdrawCallOptions(this.providers, args))
  }
}
