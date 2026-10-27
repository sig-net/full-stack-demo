import 'server-only'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import {
  type CommitTransactionArgs,
  ETHEREUM_TRANSACTION_EVENT_BY_STATE,
  EthereumTransactionStateConflict,
  type EthereumTransactionStateController,
  type ExpireTransactionArgs,
  type RecordFailureArgs,
  type RecordRejectionArgs,
  type RecordSubmissionArgs,
  type RecordSuccessArgs,
} from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import {
  assertConsistent,
  INITIAL_STATE,
  nextState,
  type TransactionAction,
} from '@/lib/ethereum/transaction-v1/transaction-state-machine'
import type { EventPublisher } from '@/lib/event/event-publisher'
import type { Logger } from '@/lib/logging/logger'

export class EthereumTransactionStateControllerImpl implements EthereumTransactionStateController {
  private readonly transactionRepository: EthereumTransactionRepository
  private readonly eventPublisher: EventPublisher
  private readonly logger: Logger

  constructor(
    transactionRepository: EthereumTransactionRepository,
    eventPublisher: EventPublisher,
    logger: Logger,
  ) {
    this.transactionRepository = transactionRepository
    this.eventPublisher = eventPublisher
    this.logger = logger
  }

  async commitTransaction(args: CommitTransactionArgs): Promise<EthereumTransaction> {
    const now = new Date()
    const stored = await this.transactionRepository.create({
      ...args,
      state: INITIAL_STATE,
      txHash: null,
      blockNumber: null,
      failure: null,
      error: null,
      createTime: now,
      updateTime: now,
    })
    await this.eventPublisher.publishEvent(
      ETHEREUM_TRANSACTION_EVENT_BY_STATE[stored.state].create(stored.name, {
        name: stored.name,
        parent: stored.parent,
      }),
    )
    this.logger.info('resource created', {
      resource: stored.name,
      parent: stored.parent,
      toState: stored.state,
    })
    return stored
  }

  recordSubmission({ name, txHash }: RecordSubmissionArgs): Promise<EthereumTransaction> {
    return this.transition(name, 'recordSubmission', { txHash })
  }

  recordSuccess({ name, blockNumber }: RecordSuccessArgs): Promise<EthereumTransaction> {
    return this.transition(name, 'recordSuccess', { blockNumber })
  }

  recordRejection({ name, error }: RecordRejectionArgs): Promise<EthereumTransaction> {
    return this.transition(name, 'recordRejection', { failure: 'Rejected', error })
  }

  recordFailure({ name, failure, blockNumber }: RecordFailureArgs): Promise<EthereumTransaction> {
    return this.transition(name, 'recordFailure', {
      failure,
      error: null,
      ...(blockNumber === undefined ? {} : { blockNumber }),
    })
  }

  expireTransaction({ name }: ExpireTransactionArgs): Promise<EthereumTransaction> {
    return this.transition(name, 'expire', { failure: 'Expired' })
  }

  /** The row is read locked, so two actors applying actions at once are serialised and the second sees the state the first left. */
  private async transition(
    name: string,
    action: TransactionAction,
    patch: Partial<EthereumTransaction>,
  ): Promise<EthereumTransaction> {
    const [current] = await this.transactionRepository.search({
      criteria: [{ type: 'exact-text', field: 'name', text: name }],
      lock: 'update',
    })
    if (current === undefined) {
      throw new Error(`${name} does not exist`)
    }
    const state = nextState(current.state, action)
    if (state === undefined) {
      throw new EthereumTransactionStateConflict(name, current.state, action)
    }
    const next: EthereumTransaction = { ...current, ...patch, state, updateTime: new Date() }
    assertConsistent(next)
    const stored = await this.transactionRepository.update(next)
    await this.eventPublisher.publishEvent(
      ETHEREUM_TRANSACTION_EVENT_BY_STATE[stored.state].create(stored.name, {
        name: stored.name,
        parent: stored.parent,
      }),
    )
    this.logger.info('transition applied', {
      resource: stored.name,
      parent: stored.parent,
      action,
      fromState: current.state,
      toState: stored.state,
    })
    return stored
  }
}
