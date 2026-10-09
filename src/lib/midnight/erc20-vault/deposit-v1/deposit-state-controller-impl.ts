import 'server-only'

import type { Deposit } from './deposit'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { DepositRepository } from './deposit-repository'
import type {
  DepositStateController,
  ResolveDepositStateArgs,
  StartDepositArgs,
} from './deposit-state-controller'

export class DepositStateControllerImpl implements DepositStateController {
  private readonly eventPublisher: EventPublisher
  private readonly depositRepository: DepositRepository

  constructor(depositRepository: DepositRepository, eventPublisher: EventPublisher) {
    this.depositRepository = depositRepository
    this.eventPublisher = eventPublisher
  }

  startDeposit(args: StartDepositArgs): Promise<Deposit> {
    throw new Error('Method not implemented.')
  }

  resolveDepositState(args: ResolveDepositStateArgs): Promise<Deposit> {
    throw new Error('Method not implemented.')
  }
}
