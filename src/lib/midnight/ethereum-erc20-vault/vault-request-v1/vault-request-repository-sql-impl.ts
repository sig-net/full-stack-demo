import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightEthereumErc20VaultRequestsV1 } from '@/lib/db/schema'
import {
  type VaultRequest,
  vaultRequestSchema,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class VaultRequestRepositorySQLImpl
  extends SQLRepository<VaultRequest, typeof midnightEthereumErc20VaultRequestsV1>
  implements VaultRequestRepository
{
  constructor(database: DatabaseExecutor) {
    super(
      database,
      midnightEthereumErc20VaultRequestsV1,
      vaultRequestSchema,
      toVaultRequestRow,
      fromVaultRequestRow,
    )
  }
}

type VaultRequestRow = typeof midnightEthereumErc20VaultRequestsV1.$inferSelect

function toVaultRequestRow(request: VaultRequest): VaultRequestRow {
  return {
    name: request.name,
    parent: request.parent,
    action: request.action,
    state: request.state,
    inIndex: request.inIndex,
    depositAccount: request.depositAccount,
    outIndex: request.outIndex,
    requestId: request.requestId,
    signedTx: request.signedTx,
    attestationBlockHeight: request.attestationBlockHeight,
    attestationOutputKind: request.attestationOutputKind,
    attestationDigest: request.attestationDigest,
    attestationSignature: request.attestationSignature,
    attestationOutput: request.attestationOutput,
    createTime: request.createTime,
    updateTime: request.updateTime,
  }
}

function fromVaultRequestRow(row: VaultRequestRow): VaultRequest {
  return {
    name: row.name,
    parent: row.parent,
    action: row.action,
    state: row.state,
    inIndex: row.inIndex,
    depositAccount: row.depositAccount,
    outIndex: row.outIndex,
    requestId: row.requestId,
    signedTx: row.signedTx,
    attestationBlockHeight: row.attestationBlockHeight,
    attestationOutputKind: row.attestationOutputKind,
    attestationDigest: row.attestationDigest,
    attestationSignature: row.attestationSignature,
    attestationOutput: row.attestationOutput,
    createTime: row.createTime,
    updateTime: row.updateTime,
  }
}
