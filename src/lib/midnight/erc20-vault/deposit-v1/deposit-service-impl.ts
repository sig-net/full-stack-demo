import 'server-only'

import { randomUUID } from 'node:crypto'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import { type Deposit, depositName } from '@/lib/midnight/erc20-vault/deposit-v1/deposit'
import type { DepositRepository } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-repository'
import { getDepositRepository } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-repository-sql-impl'
import type {
  StartDepositArgs,
  DepositService,
  GetDepositArgs,
  SubmitStartDepositArgs,
} from '@/lib/midnight/erc20-vault/deposit-v1/deposit-service'
import type { DepositStateController } from './deposit-state-controller'
import { getDepositStateController } from './deposit-state-controller-impl'

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
      callerSecret: caller.secretKey,
      deposit: {
        ...args.depositArgs,
        name: depositName(caller.name, randomUUID()),
      },
    })
  }

  submitStartDeposit(caller: Caller, args: SubmitStartDepositArgs): Promise<Deposit> {
    throw new Error('Method not implemented.')
  }

  async getDeposit(caller: Caller, args: GetDepositArgs): Promise<Deposit | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.depositRepository.getDeposit(args.name)
  }
}

// One instance serves the whole server process.
let depositService: Promise<DepositService> | undefined

export function getDepositService(): Promise<DepositService> {
  depositService ??= (async () => {
    try {
      const depositRepository = await getDepositRepository()
      const depositStateController = await getDepositStateController()
      return new DepositServiceImpl(depositRepository, depositStateController)
    } catch (error) {
      depositService = undefined
      throw error
    }
  })()
  return depositService
}
