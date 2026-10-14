import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { CallerOperationStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-resolver-impl'
import type { Redeem, RedeemOutcome } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { RedeemRepository } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-repository'
import type { RedeemStateController } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-controller'
import type {
  ResolveRedeemArgs,
  RedeemStateResolver,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-resolver'
import type { RequestLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'

export class RedeemStateResolverImpl
  extends CallerOperationStateResolverImpl<Redeem>
  implements RedeemStateResolver
{
  constructor(
    redeemRepository: RedeemRepository,
    stateController: RedeemStateController,
    midnightTransactionRepository: MidnightTransactionRepository,
    vaultRequestRepository: VaultRequestRepository,
    requestLedger: RequestLedger,
    unitOfWork: UnitOfWork,
  ) {
    super(
      {
        label: 'redeem',
        action: 'redeem',
        startCircuits: ['startRedeem'],
        completeCircuit: 'completeRedeem',
        outcomeOf: redeemOutcome,
      },
      redeemRepository,
      stateController,
      midnightTransactionRepository,
      vaultRequestRepository,
      requestLedger,
      unitOfWork,
    )
  }

  resolveRedeem({ name }: ResolveRedeemArgs): Promise<void> {
    return this.resolveOperation(name)
  }
}

/** A redeem the MPC attested as executed minted the underlying it paid out; any other verdict re-minted the shares. */
function redeemOutcome(request: VaultRequest): RedeemOutcome {
  return request.attestationOutputKind === 'executed' ? 'redeemed' : 'refunded'
}
