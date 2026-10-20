import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeSwapCallOptions,
  type CompleteSwapCircuitArgs,
  startSwapCallOptions,
  type StartSwapCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** A swap's start or complete call as unbound bytes. */
export class SwapCallBuilder extends CallerCallBuilder {
  buildStart(args: StartSwapCircuitArgs): Promise<string> {
    return this.prove(args, startSwapCallOptions(this.providers, args))
  }

  buildComplete(args: CompleteSwapCircuitArgs): Promise<string> {
    return this.prove(args, completeSwapCallOptions(this.providers, args))
  }
}
