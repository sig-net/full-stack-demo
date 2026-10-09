import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightErc20VaultDepositsV1 } from '@/lib/db/schema'
import { type Deposit, depositSchema } from '@/lib/midnight/erc20-vault/deposit-v1/deposit'
import type { DepositRepository } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class DepositRepositorySQLImpl
  extends SQLRepository<Deposit, typeof midnightErc20VaultDepositsV1>
  implements DepositRepository
{
  constructor(database: DatabaseExecutor) {
    super(database, midnightErc20VaultDepositsV1, depositSchema, toDepositRow, fromDepositRow)
  }
}

type DepositRow = typeof midnightErc20VaultDepositsV1.$inferSelect

function toDepositRow(deposit: Deposit): DepositRow {
  return {
    name: deposit.name,
    erc20Address: deposit.erc20Address,
    amount: deposit.amount,
    state: deposit.state,
    inIndex: deposit.inIndex,
    evmNonce: deposit.evmNonce,
    gasLimit: deposit.gasLimit,
    maxFeePerGas: deposit.maxFeePerGas,
    maxPriorityFeePerGas: deposit.maxPriorityFeePerGas,
  }
}

function fromDepositRow(row: DepositRow): Deposit {
  return {
    name: row.name,
    erc20Address: row.erc20Address,
    amount: row.amount,
    state: row.state,
    inIndex: row.inIndex,
    evmNonce: row.evmNonce,
    gasLimit: row.gasLimit,
    maxFeePerGas: row.maxFeePerGas,
    maxPriorityFeePerGas: row.maxPriorityFeePerGas,
  }
}
