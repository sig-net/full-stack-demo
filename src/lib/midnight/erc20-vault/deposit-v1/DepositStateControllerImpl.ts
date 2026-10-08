import 'server-only'

import type { Deposit } from './Deposit'
import type { DepositRepository } from './DepositRepository'
import type {
  DepositStateController,
  ResolveDepositStateArgs,
  StartDepositArgs,
} from './DepositStateController'
import { getDepositRepository } from './DepositRepositorySQLImpl'

export class DepositStateControllerImpl implements DepositStateController {
  private readonly depositRepository: DepositRepository

  constructor(depositRepository: DepositRepository) {
    this.depositRepository = depositRepository
  }

  startDeposit(args: StartDepositArgs): Promise<Deposit> {
    const deposit = args.deposit

    return this.depositRepository.upsertDeposit(args.deposit)
  }

  resolveDepositState(args: ResolveDepositStateArgs): Promise<Deposit> {
    throw new Error('Method not implemented.')
  }
}

// type depositAction = ''

// function determineNextAction() {

// }

// One instance serves the whole server process.
let depositStateController: Promise<DepositStateController> | undefined

export function getDepositStateController(): Promise<DepositStateController> {
  depositStateController ??= (async () => {
    try {
      const depositRepository = await getDepositRepository()
      return new DepositStateControllerImpl(depositRepository)
    } catch (error) {
      depositStateController = undefined
      throw error
    }
  })()
  return depositStateController
}
