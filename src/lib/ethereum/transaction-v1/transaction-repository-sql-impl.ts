import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { ethereumTransactionsV1 } from '@/lib/db/schema'
import {
  type EthereumTransaction,
  ethereumTransactionSchema,
} from '@/lib/ethereum/transaction-v1/transaction'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class EthereumTransactionRepositorySQLImpl
  extends SQLRepository<EthereumTransaction, typeof ethereumTransactionsV1>
  implements EthereumTransactionRepository
{
  constructor(database: DatabaseExecutor) {
    super(
      database,
      ethereumTransactionsV1,
      ethereumTransactionSchema,
      toEthereumTransactionRow,
      fromEthereumTransactionRow,
    )
  }
}

type EthereumTransactionRow = typeof ethereumTransactionsV1.$inferSelect

function toEthereumTransactionRow(transaction: EthereumTransaction): EthereumTransactionRow {
  return {
    name: transaction.name,
    parent: transaction.parent,
    state: transaction.state,
    unsignedTx: transaction.unsignedTx,
    signedTx: transaction.signedTx,
    txHash: transaction.txHash,
    error: transaction.error,
    createTime: transaction.createTime,
    updateTime: transaction.updateTime,
  }
}

function fromEthereumTransactionRow(row: EthereumTransactionRow): EthereumTransaction {
  return {
    name: row.name,
    parent: row.parent,
    state: row.state,
    unsignedTx: row.unsignedTx,
    signedTx: row.signedTx,
    txHash: row.txHash,
    error: row.error,
    createTime: row.createTime,
    updateTime: row.updateTime,
  }
}
