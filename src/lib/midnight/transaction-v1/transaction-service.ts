import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type MidnightTransaction,
  midnightTransactionNameSchema,
} from '@/lib/midnight/transaction-v1/transaction'
import { hexBytesSchema } from '@/lib/value-schemas'

/** What the caller's browser does to its own transactions: find the one its wallet must finalise, and hand the result back. */
export interface TransactionService {
  getTransaction(caller: Caller, args: GetTransactionArgs): Promise<MidnightTransaction | undefined>
  /** The transactions under a parent the caller owns, newest first. */
  listTransactions(caller: Caller, args: ListTransactionsArgs): Promise<MidnightTransaction[]>
  /** The wallet balanced and signed the unbound bytes: `AwaitingWallet` to `AwaitingSubmission`. */
  submitTransaction(caller: Caller, args: SubmitTransactionArgs): Promise<MidnightTransaction>
}

export const getTransactionArgsSchema = z.object({
  name: midnightTransactionNameSchema,
})
export type GetTransactionArgs = z.infer<typeof getTransactionArgsSchema>

export const listTransactionsArgsSchema = z.object({
  parent: z.string().min(1),
})
export type ListTransactionsArgs = z.infer<typeof listTransactionsArgsSchema>

export const submitTransactionArgsSchema = z.object({
  name: midnightTransactionNameSchema,
  finalizedTx: hexBytesSchema,
})
export type SubmitTransactionArgs = z.infer<typeof submitTransactionArgsSchema>
