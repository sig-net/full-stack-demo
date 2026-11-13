import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { messageOf } from '@/lib/message-of'
import {
  type MidnightTransaction,
  MIDNIGHT_TRANSACTION_PENDING_STATES,
} from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionLedger } from '@/lib/midnight/transaction-v1/transaction-ledger'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import {
  MidnightTransactionStateConflict,
  type MidnightTransactionStateController,
} from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { EXPIRABLE_STATES } from '@/lib/midnight/transaction-v1/transaction-state-machine'
import type {
  ResolveTransactionArgs,
  MidnightTransactionStateResolver,
} from '@/lib/midnight/transaction-v1/transaction-state-resolver'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'
import { caughtError, type Logger } from '@/lib/logging/logger'

export class MidnightTransactionStateResolverImpl implements MidnightTransactionStateResolver {
  private readonly transactionRepository: MidnightTransactionRepository
  private readonly stateController: MidnightTransactionStateController
  private readonly ledger: MidnightTransactionLedger
  private readonly relayerWallet: RelayerWallet
  private readonly unitOfWork: UnitOfWork
  private readonly logger: Logger

  constructor(
    transactionRepository: MidnightTransactionRepository,
    stateController: MidnightTransactionStateController,
    ledger: MidnightTransactionLedger,
    relayerWallet: RelayerWallet,
    unitOfWork: UnitOfWork,
    logger: Logger,
  ) {
    this.transactionRepository = transactionRepository
    this.stateController = stateController
    this.ledger = ledger
    this.relayerWallet = relayerWallet
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
    for (const state of MIDNIGHT_TRANSACTION_PENDING_STATES) {
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

  private resolve(transaction: MidnightTransaction): Promise<void> {
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
      case 'AwaitingProof':
        return this.resolveAwaitingProof(transaction)
      case 'AwaitingWallet':
        return this.resolveAwaitingWallet(transaction)
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

  private async resolveAwaitingProof({
    name,
    state,
    unprovenTx,
  }: MidnightTransaction): Promise<void> {
    if (unprovenTx === null) throw new Error(`${name} in ${state} holds no unprovenTx`)
    let unboundTx: string
    try {
      unboundTx = await this.ledger.prove(unprovenTx)
    } catch (error: unknown) {
      return this.write(() =>
        this.stateController.recordProofFailure({ name, error: messageOf(error) }),
      )
    }
    return this.write(() => this.stateController.recordProof({ name, unboundTx }))
  }

  private async resolveAwaitingWallet({
    name,
    state,
    unboundTx,
  }: MidnightTransaction): Promise<void> {
    if (unboundTx === null) throw new Error(`${name} in ${state} holds no unboundTx`)
    const finalizedTx = await this.relayerWallet.finalize(unboundTx)
    return this.write(() => this.stateController.submitTransaction({ name, finalizedTx }))
  }

  private async resolveAwaitingSubmission({
    name,
    state,
    finalizedTx,
  }: MidnightTransaction): Promise<void> {
    if (finalizedTx === null) throw new Error(`${name} in ${state} holds no finalizedTx`)
    let txId: string
    try {
      txId = await this.ledger.submit(finalizedTx)
    } catch (error: unknown) {
      return this.write(() =>
        this.stateController.recordRejection({ name, error: messageOf(error) }),
      )
    }
    return this.write(() => this.stateController.recordSubmission({ name, txId }))
  }

  private async resolveAwaitingInclusion({
    name,
    state,
    txId,
  }: MidnightTransaction): Promise<void> {
    if (txId === null) throw new Error(`${name} in ${state} holds no txId`)
    const status = await this.ledger.status(txId)
    switch (status.outcome) {
      case 'pending':
        return
      case 'succeeded':
        return this.write(() =>
          this.stateController.recordSuccess({ name, blockHeight: status.blockHeight }),
        )
      case 'failed':
        return this.write(() =>
          this.stateController.recordLedgerFailure({
            name,
            failure: status.failure,
            error: status.error,
            blockHeight: status.blockHeight,
          }),
        )
      default: {
        const unhandled: never = status
        throw new Error(`Unhandled status ${JSON.stringify(unhandled)}`)
      }
    }
  }

  /** One transition per resolve. A conflict means another resolver applied it first. */
  private async write(transition: () => Promise<MidnightTransaction>): Promise<void> {
    try {
      await this.unitOfWork.runInTransaction(transition)
    } catch (error: unknown) {
      if (!(error instanceof MidnightTransactionStateConflict)) throw error
      this.logger.debug('state conflict swallowed', {
        resource: error.resource,
        state: error.state,
        action: error.action,
      })
    }
  }
}
