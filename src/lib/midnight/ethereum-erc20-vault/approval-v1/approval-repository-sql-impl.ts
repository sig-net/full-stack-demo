import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightEthereumErc20VaultApprovalsV1 } from '@/lib/db/schema'
import {
  type Approval,
  approvalSchema,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { ApprovalRepository } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class ApprovalRepositorySQLImpl
  extends SQLRepository<Approval, typeof midnightEthereumErc20VaultApprovalsV1>
  implements ApprovalRepository
{
  constructor(database: DatabaseExecutor) {
    super(
      database,
      midnightEthereumErc20VaultApprovalsV1,
      approvalSchema,
      toApprovalRow,
      fromApprovalRow,
    )
  }
}

type ApprovalRow = typeof midnightEthereumErc20VaultApprovalsV1.$inferSelect

function toApprovalRow(approval: Approval): ApprovalRow {
  return {
    name: approval.name,
    kind: approval.kind,
    erc20Address: approval.erc20Address,
    spender: approval.spender,
    state: approval.state,
    inIndex: approval.inIndex,
    vaultAccount: approval.vaultAccount,
    outcome: approval.outcome,
    failure: approval.failure,
    error: approval.error,
    createTime: approval.createTime,
    updateTime: approval.updateTime,
  }
}

function fromApprovalRow(row: ApprovalRow): Approval {
  return {
    name: row.name,
    kind: row.kind,
    erc20Address: row.erc20Address,
    spender: row.spender,
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
