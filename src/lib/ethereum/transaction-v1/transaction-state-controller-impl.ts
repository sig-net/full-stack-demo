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
  type RecordSubmissionArgs,
  type RecordSuccessArgs,
} from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import {
  assertConsistent,
  COMMITTABLE_STATES,
  nextState,
  type TransactionAction,
} from '@/lib/ethereum/transaction-v1/transaction-state-machine'
import type { EventPublisher } from '@/lib/event/event-publisher'

export class EthereumTransactionStateControllerImpl implements EthereumTransactionStateController {
  private readonly transactionRepository: EthereumTransactionRepository
  private readonly eventPublisher: EventPublisher

  constructor(
    transactionRepository: EthereumTransactionRepository,
    eventPublisher: EventPublisher,
  ) {
    this.transactionRepository = transactionRepository
    this.eventPublisher = eventPublisher
  }

  async commitTransaction(args: CommitTransactionArgs): Promise<EthereumTransaction> {
    const now = new Date()
    const transaction: EthereumTransaction = {
      ...args.transaction,
      createTime: now,
      updateTime: now,
    }
    if (!COMMITTABLE_STATES.includes(transaction.state)) {
      throw new Error(`${transaction.name} cannot be committed in state ${transaction.state}`)
    }
    assertConsistent(transaction)
    const stored = await this.transactionRepository.create(transaction)
    await this.publishEntered(stored)
    return stored
  }

  recordSubmission({ name, txHash }: RecordSubmissionArgs): Promise<EthereumTransaction> {
    return this.transition(name, 'recordSubmission', { txHash })
  }

  recordSuccess({ name, blockNumber }: RecordSuccessArgs): Promise<EthereumTransaction> {
    return this.transition(name, 'recordSuccess', { blockNumber })
  }

  recordFailure({
    name,
    failure,
    error,
    blockNumber,
  }: RecordFailureArgs): Promise<EthereumTransaction> {
    return this.transition(name, 'recordFailure', {
      failure,
      error: error ?? null,
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
    await this.publishEntered(stored)
    return stored
  }

  private publishEntered(transaction: EthereumTransaction): Promise<void> {
    return this.eventPublisher.publishEvent(
      ETHEREUM_TRANSACTION_EVENT_BY_STATE[transaction.state].create(transaction.name, {
        name: transaction.name,
        parent: transaction.parent,
      }),
    )
  }
}
