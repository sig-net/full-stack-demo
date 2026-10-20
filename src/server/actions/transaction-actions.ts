'use server'

import type { TransactionResult } from '@/lib/midnight/transaction-v1/transaction-service-adaptor'
import type { GetTransactionArgs } from '@/lib/midnight/transaction-v1/transaction-service'
import { getBackend } from '@/server/backend'

export async function getTransaction(
  callerSecret: string,
  args: GetTransactionArgs,
): Promise<TransactionResult> {
  return (await getBackend()).midnight.transactionV1.adaptor.getTransaction(callerSecret, args)
}
