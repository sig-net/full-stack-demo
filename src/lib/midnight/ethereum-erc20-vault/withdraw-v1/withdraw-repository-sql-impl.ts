import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightEthereumErc20VaultWithdrawsV1 } from '@/lib/db/schema'
import {
  type Withdraw,
  withdrawSchema,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
import type { WithdrawRepository } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class WithdrawRepositorySQLImpl
  extends SQLRepository<Withdraw, typeof midnightEthereumErc20VaultWithdrawsV1>
  implements WithdrawRepository
{
  constructor(database: DatabaseExecutor) {
    super(
      database,
      midnightEthereumErc20VaultWithdrawsV1,
      withdrawSchema,
      toWithdrawRow,
      fromWithdrawRow,
    )
  }
}

type WithdrawRow = typeof midnightEthereumErc20VaultWithdrawsV1.$inferSelect

function toWithdrawRow(withdraw: Withdraw): WithdrawRow {
  return {
    name: withdraw.name,
    erc20Address: withdraw.erc20Address,
    amount: withdraw.amount,
    destEvmAddress: withdraw.destEvmAddress,
    state: withdraw.state,
    inIndex: withdraw.inIndex,
    vaultAccount: withdraw.vaultAccount,
    outcome: withdraw.outcome,
    failure: withdraw.failure,
    error: withdraw.error,
    createTime: withdraw.createTime,
    updateTime: withdraw.updateTime,
  }
}

function fromWithdrawRow(row: WithdrawRow): Withdraw {
  return {
    name: row.name,
    erc20Address: row.erc20Address,
    amount: row.amount,
    destEvmAddress: row.destEvmAddress,
    state: row.state,
    inIndex: row.inIndex,
    vaultAccount: row.vaultAccount,
    outcome: row.outcome,
    failure: row.failure,
    error: row.error,
    createTime: row.createTime,
    updateTime: row.updateTime,
  }
}
