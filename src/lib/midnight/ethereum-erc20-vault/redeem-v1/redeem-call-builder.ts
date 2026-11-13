import { readVaultLedger } from '@sig-net/midnight-examples-erc20-vault-contract'

import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeRedeemCallOptions,
  type CompleteRedeemCircuitArgs,
  startRedeemCallOptions,
  startFeeOf,
  type StartRedeemCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A redeem's start or complete call as unbound bytes. */
export class RedeemCallBuilder extends CallerCallBuilder {
  /** The fee is read from the ledger just before the build, since the circuit asserts the coin against the fee the ledger holds when the call runs. */
  async buildStart(args: StartRedeemCircuitArgs): Promise<string> {
    const state = await readVaultLedger(
      this.providers.publicDataProvider,
      this.providers.vaultAddress,
    )
    return this.prove(
      args,
      startRedeemCallOptions(this.providers, args, startFeeOf(state, state.stataToken, 'redeem')),
    )
  }

  buildComplete(args: CompleteRedeemCircuitArgs): Promise<string> {
    return this.prove(args, completeRedeemCallOptions(this.providers, args))
  }
}
