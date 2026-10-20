import { CallerCallBuilder } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-call-builder'
import {
  completeApproveCallOptions,
  type CompleteApproveCircuitArgs,
  startApproveRouterCallOptions,
  type StartApproveRouterCircuitArgs,
  startApproveStataCallOptions,
  type StartApproveStataCircuitArgs,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** An approval's start call (the kind's circuit) or complete call as unbound bytes. */
export class ApprovalCallBuilder extends CallerCallBuilder {
  buildStart(args: StartApprovalCircuitArgs): Promise<string> {
    return args.kind === 'router'
      ? this.prove(args, startApproveRouterCallOptions(this.providers, args))
      : this.prove(args, startApproveStataCallOptions(this.providers, args))
  }

  buildComplete(args: CompleteApproveCircuitArgs): Promise<string> {
    return this.prove(args, completeApproveCallOptions(this.providers, args))
  }
}

/** The approval request's kind picks the start circuit, and the router's token travels with it. */
export type StartApprovalCircuitArgs =
  | ({ readonly kind: 'router' } & StartApproveRouterCircuitArgs)
  | ({ readonly kind: 'stata' } & StartApproveStataCircuitArgs)
