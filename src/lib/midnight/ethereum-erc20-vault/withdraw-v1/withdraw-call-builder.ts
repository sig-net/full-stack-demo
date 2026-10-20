import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeWithdrawCallOptions,
  type CompleteWithdrawCircuitArgs,
  startWithdrawCallOptions,
  type StartWithdrawCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A withdrawal's start or complete call as unbound bytes. */
export class WithdrawCallBuilder extends CallerCallBuilder {
  buildStart(args: StartWithdrawCircuitArgs): Promise<string> {
    return this.prove(args, startWithdrawCallOptions(this.providers, args))
  }

  buildComplete(args: CompleteWithdrawCircuitArgs): Promise<string> {
    return this.prove(args, completeWithdrawCallOptions(this.providers, args))
  }
}
