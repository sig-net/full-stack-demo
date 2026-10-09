import 'server-only'

import { randomUUID } from 'node:crypto'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import { type Deposit, depositName } from '@/lib/midnight/erc20-vault/deposit-v1/deposit'
import type { DepositRepository } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-repository'
import type {
  StartDepositArgs,
  DepositService,
  GetDepositArgs,
} from '@/lib/midnight/erc20-vault/deposit-v1/deposit-service'
import type { DepositStateController } from './deposit-state-controller'

export class DepositServiceImpl implements DepositService {
  private readonly depositRepository: DepositRepository
  private readonly depositStateController: DepositStateController

  constructor(
    depositRepository: DepositRepository,
    depositStateController: DepositStateController,
  ) {
    this.depositRepository = depositRepository
    this.depositStateController = depositStateController
  }

  startDeposit(caller: Caller, args: StartDepositArgs): Promise<Deposit> {
    return this.depositStateController.startDeposit({
      caller,
      name: depositName(caller.name, randomUUID()),
      depositRequest: args.depositRequest,
    })
  }

  async getDeposit(caller: Caller, args: GetDepositArgs): Promise<Deposit | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.depositRepository.get(args.name)
  }
}
