import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeSupplyCallOptions,
  type CompleteSupplyCircuitArgs,
  startSupplyCallOptions,
  type StartSupplyCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A supply's start or complete call as unbound bytes. */
export class SupplyCallBuilder extends CallerCallBuilder {
  buildStart(args: StartSupplyCircuitArgs): Promise<string> {
    return this.prove(args, startSupplyCallOptions(this.providers, args))
  }

  buildComplete(args: CompleteSupplyCircuitArgs): Promise<string> {
    return this.prove(args, completeSupplyCallOptions(this.providers, args))
  }
}
