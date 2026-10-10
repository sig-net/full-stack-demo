import 'server-only'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { messageOf } from '@/lib/message-of'
import {
  type MidnightTransaction,
  MIDNIGHT_TRANSACTION_STATES,
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
  type MidnightTransactionState,
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

export class MidnightTransactionStateResolverImpl implements MidnightTransactionStateResolver {
  private readonly transactionRepository: MidnightTransactionRepository
  private readonly stateController: MidnightTransactionStateController
  private readonly ledger: MidnightTransactionLedger
  private readonly relayerWallet: RelayerWallet
  private readonly unitOfWork: UnitOfWork

  constructor(
    transactionRepository: MidnightTransactionRepository,
    stateController: MidnightTransactionStateController,
    ledger: MidnightTransactionLedger,
    relayerWallet: RelayerWallet,
    unitOfWork: UnitOfWork,
  ) {
    this.transactionRepository = transactionRepository
    this.stateController = stateController
    this.ledger = ledger
    this.relayerWallet = relayerWallet
    this.unitOfWork = unitOfWork
  }

  /** Reads outside any transaction: the controller re-reads under lock before it writes. */
  async resolveTransaction({ name }: ResolveTransactionArgs): Promise<void> {
    const transaction = await this.transactionRepository.get(name)
    if (transaction === undefined) return
    await this.resolve(transaction)
  }

  /** One transaction's failure does not stop the rest. */
  async resolvePending(): Promise<void> {
    for (const state of PENDING_STATES) {
      const transactions = await this.transactionRepository.search({
        criteria: [{ type: 'exact-text', field: 'state', text: state }],
        order: { field: 'createTime', direction: 'asc' },
      })
      for (const transaction of transactions) {
        try {
          await this.resolve(transaction)
        } catch (error: unknown) {
          console.error(`Resolving Midnight transaction ${transaction.name} failed`, error)
        }
      }
    }
  }

  private resolve(transaction: MidnightTransaction): Promise<void> {
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

  private async resolveAwaitingProof({ name, unprovenTx }: MidnightTransaction): Promise<void> {
    if (unprovenTx === null) return
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

  /** A caller transaction is the browser wallet's to-do, and a relayer transaction is finalised here. */
  private async resolveAwaitingWallet({
    name,
    signer,
    unboundTx,
  }: MidnightTransaction): Promise<void> {
    if (signer === 'caller' || unboundTx === null) return
    const finalizedTx = await this.relayerWallet.finalize(unboundTx)
    return this.write(() => this.stateController.submitTransaction({ name, finalizedTx }))
  }

  private async resolveAwaitingSubmission({
    name,
    finalizedTx,
  }: MidnightTransaction): Promise<void> {
    if (finalizedTx === null) return
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

  private async resolveAwaitingInclusion({ name, txId }: MidnightTransaction): Promise<void> {
    if (txId === null) return
    const status = await this.ledger.status(txId)
    switch (status.outcome) {
      case 'pending':
        return
      case 'succeeded':
        return this.write(() => this.stateController.recordSuccess({ name }))
      case 'failed':
        return this.write(() =>
          this.stateController.recordLedgerFailure({
            name,
            failure: status.failure,
            error: status.error,
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
    }
  }
}

const PENDING_STATES: readonly MidnightTransactionState[] = MIDNIGHT_TRANSACTION_STATES.filter(
  (state) => !MIDNIGHT_TRANSACTION_TERMINAL_STATES.some((terminal) => terminal === state),
)
