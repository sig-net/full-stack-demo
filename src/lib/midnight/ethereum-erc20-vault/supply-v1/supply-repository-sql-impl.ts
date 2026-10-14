import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightEthereumErc20VaultSuppliesV1 } from '@/lib/db/schema'
import { type Supply, supplySchema } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { SupplyRepository } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class SupplyRepositorySQLImpl
  extends SQLRepository<Supply, typeof midnightEthereumErc20VaultSuppliesV1>
  implements SupplyRepository
{
  constructor(database: DatabaseExecutor) {
    super(database, midnightEthereumErc20VaultSuppliesV1, supplySchema, toSupplyRow, fromSupplyRow)
  }
}

type SupplyRow = typeof midnightEthereumErc20VaultSuppliesV1.$inferSelect

function toSupplyRow(supply: Supply): SupplyRow {
  return {
    name: supply.name,
    underlyingErc20Address: supply.underlyingErc20Address,
    stataErc20Address: supply.stataErc20Address,
    amount: supply.amount,
    state: supply.state,
    inIndex: supply.inIndex,
    vaultAccount: supply.vaultAccount,
    outcome: supply.outcome,
    failure: supply.failure,
    error: supply.error,
    createTime: supply.createTime,
    updateTime: supply.updateTime,
  }
}

function fromSupplyRow(row: SupplyRow): Supply {
  return {
    name: row.name,
    underlyingErc20Address: row.underlyingErc20Address,
    stataErc20Address: row.stataErc20Address,
    amount: row.amount,
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
