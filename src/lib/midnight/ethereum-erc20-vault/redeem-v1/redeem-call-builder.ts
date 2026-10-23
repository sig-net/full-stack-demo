import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeRedeemCallOptions,
  type CompleteRedeemCircuitArgs,
  startRedeemCallOptions,
  type StartRedeemCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A redeem's start or complete call as unbound bytes. */
export class RedeemCallBuilder extends CallerCallBuilder {
  buildStart(args: StartRedeemCircuitArgs): Promise<string> {
    return this.prove(args, startRedeemCallOptions(this.providers, args))
  }

  buildComplete(args: CompleteRedeemCircuitArgs): Promise<string> {
    return this.prove(args, completeRedeemCallOptions(this.providers, args))
  }
}
