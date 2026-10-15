import 'server-only'

import { Transaction } from 'ethers'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { messageOf } from '@/lib/message-of'
import {
  type EthereumTransaction,
  ETHEREUM_TRANSACTION_PENDING_STATES,
} from '@/lib/ethereum/transaction-v1/transaction'
import type { EthereumTransactionLedger } from '@/lib/ethereum/transaction-v1/transaction-ledger'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import {
  EthereumTransactionStateConflict,
  type EthereumTransactionStateController,
} from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import { EXPIRABLE_STATES } from '@/lib/ethereum/transaction-v1/transaction-state-machine'
import type {
  EthereumTransactionStateResolver,
  ResolveTransactionArgs,
} from '@/lib/ethereum/transaction-v1/transaction-state-resolver'
import { caughtError, type Logger } from '@/lib/logging/logger'

export class EthereumTransactionStateResolverImpl implements EthereumTransactionStateResolver {
  private readonly transactionRepository: EthereumTransactionRepository
  private readonly stateController: EthereumTransactionStateController
  private readonly ledger: EthereumTransactionLedger
  private readonly unitOfWork: UnitOfWork
  private readonly logger: Logger

  constructor(
    transactionRepository: EthereumTransactionRepository,
    stateController: EthereumTransactionStateController,
    ledger: EthereumTransactionLedger,
    unitOfWork: UnitOfWork,
    logger: Logger,
  ) {
    this.transactionRepository = transactionRepository
    this.stateController = stateController
    this.ledger = ledger
    this.unitOfWork = unitOfWork
    this.logger = logger
  }

  /** Reads outside any transaction: the controller re-reads under lock before it writes. */
  async resolveTransaction({ name }: ResolveTransactionArgs): Promise<void> {
    const transaction = await this.transactionRepository.get(name)
    if (transaction === undefined) return
    await this.resolve(transaction)
  }

  /** One transaction's failure does not stop the rest. */
  async resolvePending(): Promise<void> {
    for (const state of ETHEREUM_TRANSACTION_PENDING_STATES) {
      const transactions = await this.transactionRepository.search({
        criteria: [{ type: 'exact-text', field: 'state', text: state }],
        order: { field: 'createTime', direction: 'asc' },
      })
      for (const transaction of transactions) {
        try {
          await this.resolve(transaction)
        } catch (error: unknown) {
          this.logger.error('resolve failed', {
            resource: transaction.name,
            state: transaction.state,
            err: caughtError(error),
          })
        }
      }
    }
  }

  private resolve(transaction: EthereumTransaction): Promise<void> {
    this.logger.debug('resolving', { resource: transaction.name, state: transaction.state })
    const { name } = transaction
    if (
      EXPIRABLE_STATES.includes(transaction.state) &&
      transaction.expireTime !== null &&
      transaction.expireTime.getTime() <= Date.now()
    ) {
      return this.write(() => this.stateController.expireTransaction({ name }))
    }
    switch (transaction.state) {
      case 'AwaitingSubmission':
        return this.resolveAwaitingSubmission(transaction)
      case 'AwaitingInclusion':
        return this.resolveAwaitingInclusion(transaction)
      case 'Succeeded':
      case 'Failed':
        return Promise.resolve()
      default: {
        const unhandled: never = transaction.state
        throw new Error(`Unhandled state ${JSON.stringify(unhandled)}`)
      }
    }
  }

  private async resolveAwaitingSubmission({ name, signedTx }: EthereumTransaction): Promise<void> {
    let txHash: string
    try {
      txHash = await this.ledger.broadcast(signedTx)
    } catch (error: unknown) {
      return this.write(() =>
        this.stateController.recordRejection({ name, error: messageOf(error) }),
      )
    }
    return this.write(() => this.stateController.recordSubmission({ name, txHash }))
  }

  /** The sender and nonce are read from the signed bytes, so the row carries only what the chain returned. */
  private async resolveAwaitingInclusion({
    name,
    state,
    signedTx,
    txHash,
  }: EthereumTransaction): Promise<void> {
    if (txHash === null) throw new Error(`${name} in ${state} holds no txHash`)
    const { from, nonce } = Transaction.from(signedTx)
    if (from === null) {
      throw new Error(`${name} holds bytes without a signature`)
    }
    const status = await this.ledger.status({ txHash, from, nonce })
    switch (status.outcome) {
      case 'pending':
        return
      case 'mined':
        return this.write(() =>
          this.stateController.recordSuccess({ name, blockNumber: status.blockNumber }),
        )
      case 'reverted':
        return this.write(() =>
          this.stateController.recordFailure({
            name,
            failure: 'Reverted',
            blockNumber: status.blockNumber,
          }),
        )
      case 'nonceConsumed':
        return this.write(() =>
          this.stateController.recordFailure({ name, failure: 'NonceConsumed' }),
        )
      default: {
        const unhandled: never = status
        throw new Error(`Unhandled status ${JSON.stringify(unhandled)}`)
      }
    }
  }

  /** One transition per resolve. A conflict means another resolver applied it first. */
  private async write(transition: () => Promise<EthereumTransaction>): Promise<void> {
    try {
      await this.unitOfWork.runInTransaction(transition)
    } catch (error: unknown) {
      if (!(error instanceof EthereumTransactionStateConflict)) throw error
      this.logger.debug('state conflict swallowed', {
        resource: error.resource,
        state: error.state,
        action: error.action,
      })
    }
  }
}
