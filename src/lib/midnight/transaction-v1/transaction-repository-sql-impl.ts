import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightTransactionsV1 } from '@/lib/db/schema'
import {
  type MidnightTransaction,
  midnightTransactionSchema,
} from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class MidnightTransactionRepositorySQLImpl
  extends SQLRepository<MidnightTransaction, typeof midnightTransactionsV1>
  implements MidnightTransactionRepository
{
  constructor(database: DatabaseExecutor) {
    super(
      database,
      midnightTransactionsV1,
      midnightTransactionSchema,
      toMidnightTransactionRow,
      fromMidnightTransactionRow,
    )
  }
}

type MidnightTransactionRow = typeof midnightTransactionsV1.$inferSelect

function toMidnightTransactionRow(transaction: MidnightTransaction): MidnightTransactionRow {
  return {
    name: transaction.name,
    parent: transaction.parent,
    state: transaction.state,
    circuit: transaction.circuit,
    signer: transaction.signer,
    unprovenTx: transaction.unprovenTx,
    unboundTx: transaction.unboundTx,
    finalizedTx: transaction.finalizedTx,
    expireTime: transaction.expireTime,
    txId: transaction.txId,
    failure: transaction.failure,
    error: transaction.error,
    createTime: transaction.createTime,
    updateTime: transaction.updateTime,
  }
}

function fromMidnightTransactionRow(row: MidnightTransactionRow): MidnightTransaction {
  return {
    name: row.name,
    parent: row.parent,
    state: row.state,
    circuit: row.circuit,
    signer: row.signer,
    unprovenTx: row.unprovenTx,
    unboundTx: row.unboundTx,
    finalizedTx: row.finalizedTx,
    expireTime: row.expireTime,
    txId: row.txId,
    failure: row.failure,
    error: row.error,
    createTime: row.createTime,
    updateTime: row.updateTime,
  }
}
