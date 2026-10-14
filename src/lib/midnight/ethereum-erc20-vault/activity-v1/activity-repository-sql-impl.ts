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
  depositAccount: midnightEthereumErc20VaultActivityV1.depositAccount,
  erc20Address: midnightEthereumErc20VaultActivityV1.erc20Address,
  amount: midnightEthereumErc20VaultActivityV1.amount,
  outcome: midnightEthereumErc20VaultActivityV1.outcome,
  error: midnightEthereumErc20VaultActivityV1.error,
  depositState: midnightEthereumErc20VaultActivityV1.depositState,
  vaultRequestState: midnightEthereumErc20VaultActivityV1.vaultRequestState,
  vaultRequestId: midnightEthereumErc20VaultActivityV1.vaultRequestId,
  walletTransaction: midnightEthereumErc20VaultActivityV1.walletTransaction,
  startTransaction: midnightEthereumErc20VaultActivityV1.startTransaction,
  foreignChainTransaction: midnightEthereumErc20VaultActivityV1.foreignChainTransaction,
  completeTransaction: midnightEthereumErc20VaultActivityV1.completeTransaction,
  createTime: midnightEthereumErc20VaultActivityV1.createTime,
  updateTime: midnightEthereumErc20VaultActivityV1.updateTime,
}

function fromActivityRow(row: ActivityRow): Activity {
  return {
    name: row.name,
    type: row.type,
    state: row.state,
    depositAccount: row.depositAccount,
    erc20Address: row.erc20Address,
    amount: row.amount,
    outcome: row.outcome,
    error: row.error,
    depositState: row.depositState,
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
