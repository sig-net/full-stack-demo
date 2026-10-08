import 'server-only'

import type { Deposit } from './deposit'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { DepositRepository } from './deposit-repository'
import type {
  DepositStateController,
  ResolveDepositStateArgs,
  StartDepositArgs,
} from './deposit-state-controller'
import { getDepositRepository } from './deposit-repository-sql-impl'
import { lazySingleton } from '@/lib/lazy-singleton'
import { getOutboxEventPublisher } from '@/lib/event/event-publisher-outbox-impl'

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

/** One instance serves the whole server process. */
export const getDepositStateController: () => Promise<DepositStateController> = lazySingleton(
  async () =>
    new DepositStateControllerImpl(await getDepositRepository(), await getOutboxEventPublisher()),
)
