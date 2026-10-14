import 'server-only'

import type { PgColumn } from 'drizzle-orm/pg-core'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightEthereumErc20VaultActivityV1 } from '@/lib/db/schema'
import {
  type Activity,
  activitySchema,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type { ActivityRepository } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-repository'
import { SQLReadRepository } from '@/lib/repository/repository-sql-read-impl'

export class ActivityRepositorySQLImpl
  extends SQLReadRepository<Activity, ActivityRow>
  implements ActivityRepository
{
  constructor(database: DatabaseExecutor) {
    super(
      database,
      midnightEthereumErc20VaultActivityV1,
      ACTIVITY_COLUMNS,
      activitySchema,
      fromActivityRow,
    )
  }
}

type ActivityRow = typeof midnightEthereumErc20VaultActivityV1.$inferSelect

const ACTIVITY_COLUMNS: Record<keyof Activity, PgColumn> = {
  name: midnightEthereumErc20VaultActivityV1.name,
  type: midnightEthereumErc20VaultActivityV1.type,
  state: midnightEthereumErc20VaultActivityV1.state,
  erc20Address: midnightEthereumErc20VaultActivityV1.erc20Address,
  amount: midnightEthereumErc20VaultActivityV1.amount,
  erc20AddressOut: midnightEthereumErc20VaultActivityV1.erc20AddressOut,
  amountOut: midnightEthereumErc20VaultActivityV1.amountOut,
  spender: midnightEthereumErc20VaultActivityV1.spender,
  destination: midnightEthereumErc20VaultActivityV1.destination,
  outcome: midnightEthereumErc20VaultActivityV1.outcome,
  error: midnightEthereumErc20VaultActivityV1.error,
  resourceState: midnightEthereumErc20VaultActivityV1.resourceState,
  vaultRequestState: midnightEthereumErc20VaultActivityV1.vaultRequestState,
  vaultRequestId: midnightEthereumErc20VaultActivityV1.vaultRequestId,
  walletTransaction: midnightEthereumErc20VaultActivityV1.walletTransaction,
  startTransaction: midnightEthereumErc20VaultActivityV1.startTransaction,
  foreignChainTransaction: midnightEthereumErc20VaultActivityV1.foreignChainTransaction,
  completeTransaction: midnightEthereumErc20VaultActivityV1.completeTransaction,
  createTime: midnightEthereumErc20VaultActivityV1.createTime,
  updateTime: midnightEthereumErc20VaultActivityV1.updateTime,
}

/** The row's columns under the resource's field names: the schema's union picks the type's shape. */
function fromActivityRow(row: ActivityRow): unknown {
  return {
    name: row.name,
    type: row.type,
    state: row.state,
    erc20Address: row.erc20Address,
    amount: row.amount,
    erc20AddressOut: row.erc20AddressOut,
    amountOut: row.amountOut,
    spender: row.spender,
    destination: row.destination,
    outcome: row.outcome,
    error: row.error,
    resourceState: row.resourceState,
    vaultRequestState: row.vaultRequestState,
    vaultRequestId: row.vaultRequestId,
    walletTransaction: row.walletTransaction,
    startTransaction: row.startTransaction,
    foreignChainTransaction: row.foreignChainTransaction,
    completeTransaction: row.completeTransaction,
    createTime: row.createTime,
    updateTime: row.updateTime,
  }
}
