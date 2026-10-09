import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import {
  getTransactionArgsSchema,
  listTransactionsArgsSchema,
  submitTransactionArgsSchema,
  type TransactionService,
} from '@/lib/midnight/transaction-v1/transaction-service'
import { MidnightTransactionStateConflict } from '@/lib/midnight/transaction-v1/transaction-state-controller'

export class TransactionServiceAdaptor {
  private readonly transactionService: TransactionService
  private readonly unitOfWork: UnitOfWork

  constructor(transactionService: TransactionService, unitOfWork: UnitOfWork) {
    this.transactionService = transactionService
    this.unitOfWork = unitOfWork
  }

  async getTransaction(callerSecret: string, args: unknown): Promise<TransactionResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = getTransactionArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const transaction = await this.transactionService.getTransaction(caller, parsed.data)
    if (transaction === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, transaction }
  }

  async listTransactions(callerSecret: string, args: unknown): Promise<TransactionListResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = listTransactionsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return {
      ok: true,
      transactions: await this.transactionService.listTransactions(caller, parsed.data),
    }
  }

  /** A write boundary: the transition runs inside one database transaction. */
  async submitTransaction(callerSecret: string, args: unknown): Promise<TransactionResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = submitTransactionArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    try {
      const transaction = await this.unitOfWork.runInTransaction(() =>
        this.transactionService.submitTransaction(caller, parsed.data),
      )
      return { ok: true, transaction }
    } catch (error: unknown) {
      if (error instanceof MidnightTransactionStateConflict)
        return { ok: false, error: error.message }
      throw error
    }
  }
}

export type TransactionResult =
  | { readonly ok: true; readonly transaction: MidnightTransaction }
  | { readonly ok: false; readonly error: string }

export type TransactionListResult =
  | { readonly ok: true; readonly transactions: MidnightTransaction[] }
  | { readonly ok: false; readonly error: string }
