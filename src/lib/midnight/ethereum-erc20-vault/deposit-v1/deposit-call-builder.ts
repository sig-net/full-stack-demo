import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeDepositCallOptions,
  type CompleteDepositCircuitArgs,
  startDepositCallOptions,
  type StartDepositCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A deposit's start or complete call as unbound bytes. */
export class DepositCallBuilder extends CallerCallBuilder {
  buildStart(args: StartDepositCircuitArgs): Promise<string> {
    return this.prove(args, startDepositCallOptions(this.providers, args))
  }

  buildComplete(args: CompleteDepositCircuitArgs): Promise<string> {
    return this.prove(args, completeDepositCallOptions(this.providers, args))
  }
}
