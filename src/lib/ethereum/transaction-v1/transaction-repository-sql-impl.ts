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
    signedTx: transaction.signedTx,
    txHash: transaction.txHash,
    blockNumber: transaction.blockNumber,
    expireTime: transaction.expireTime,
    failure: transaction.failure,
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
    signedTx: row.signedTx,
    txHash: row.txHash,
    blockNumber: row.blockNumber,
    expireTime: row.expireTime,
    failure: row.failure,
    error: row.error,
    createTime: row.createTime,
    updateTime: row.updateTime,
  }
}
