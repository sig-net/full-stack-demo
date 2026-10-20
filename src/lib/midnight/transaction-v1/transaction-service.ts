import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type MidnightTransaction,
  midnightTransactionNameSchema,
} from '@/lib/midnight/transaction-v1/transaction'

/** What the caller's browser reads of its own transactions. */
export interface TransactionService {
  getTransaction(caller: Caller, args: GetTransactionArgs): Promise<MidnightTransaction | undefined>
}

export const getTransactionArgsSchema = z.object({
  name: midnightTransactionNameSchema,
})
export type GetTransactionArgs = z.infer<typeof getTransactionArgsSchema>
