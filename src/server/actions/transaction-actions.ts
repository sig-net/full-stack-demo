'use server'

import type {
  TransactionListResult,
  TransactionResult,
} from '@/lib/midnight/transaction-v1/transaction-service-adaptor'
import type {
  GetTransactionArgs,
  ListTransactionsArgs,
  SubmitTransactionArgs,
} from '@/lib/midnight/transaction-v1/transaction-service'
import { getBackend } from '@/server/backend'

export async function getTransaction(
  callerSecret: string,
  args: GetTransactionArgs,
): Promise<TransactionResult> {
  return (await getBackend()).midnight.transactionV1.adaptor.getTransaction(callerSecret, args)
}

export async function listTransactions(
  callerSecret: string,
  args: ListTransactionsArgs,
): Promise<TransactionListResult> {
  return (await getBackend()).midnight.transactionV1.adaptor.listTransactions(callerSecret, args)
}

export async function submitTransaction(
  callerSecret: string,
  args: SubmitTransactionArgs,
): Promise<TransactionResult> {
  return (await getBackend()).midnight.transactionV1.adaptor.submitTransaction(callerSecret, args)
}
