import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightEthereumErc20VaultRedeemsV1 } from '@/lib/db/schema'
import { type Redeem, redeemSchema } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { RedeemRepository } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class RedeemRepositorySQLImpl
  extends SQLRepository<Redeem, typeof midnightEthereumErc20VaultRedeemsV1>
  implements RedeemRepository
{
  constructor(database: DatabaseExecutor) {
    super(database, midnightEthereumErc20VaultRedeemsV1, redeemSchema, toRedeemRow, fromRedeemRow)
  }
}

type RedeemRow = typeof midnightEthereumErc20VaultRedeemsV1.$inferSelect

function toRedeemRow(redeem: Redeem): RedeemRow {
  return {
    name: redeem.name,
    stataErc20Address: redeem.stataErc20Address,
    underlyingErc20Address: redeem.underlyingErc20Address,
    shares: redeem.shares,
    state: redeem.state,
    inIndex: redeem.inIndex,
    vaultAccount: redeem.vaultAccount,
    outcome: redeem.outcome,
    failure: redeem.failure,
    error: redeem.error,
    createTime: redeem.createTime,
    updateTime: redeem.updateTime,
  }
}

function fromRedeemRow(row: RedeemRow): Redeem {
  return {
    name: row.name,
    stataErc20Address: row.stataErc20Address,
    underlyingErc20Address: row.underlyingErc20Address,
    shares: row.shares,
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
