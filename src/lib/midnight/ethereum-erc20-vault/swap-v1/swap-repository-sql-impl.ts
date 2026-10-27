import 'server-only'

import type { DatabaseExecutor } from '@/lib/db/database'
import { midnightEthereumErc20VaultSwapsV1 } from '@/lib/db/schema'
import { type Swap, swapSchema } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { SwapRepository } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-repository'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class SwapRepositorySQLImpl
  extends SQLRepository<Swap, typeof midnightEthereumErc20VaultSwapsV1>
  implements SwapRepository
{
  constructor(database: DatabaseExecutor) {
    super(database, midnightEthereumErc20VaultSwapsV1, swapSchema, toSwapRow, fromSwapRow)
  }
}

type SwapRow = typeof midnightEthereumErc20VaultSwapsV1.$inferSelect

function toSwapRow(swap: Swap): SwapRow {
  return {
    name: swap.name,
    erc20AddressIn: swap.erc20AddressIn,
    erc20AddressOut: swap.erc20AddressOut,
    fee: swap.fee,
    amountOut: swap.amountOut,
    amountInMaximum: swap.amountInMaximum,
    state: swap.state,
    inIndex: swap.inIndex,
    userCommitment: swap.userCommitment,
    vaultAccount: swap.vaultAccount,
    outcome: swap.outcome,
    failure: swap.failure,
    error: swap.error,
    createTime: swap.createTime,
    updateTime: swap.updateTime,
  }
}

function fromSwapRow(row: SwapRow): Swap {
  return {
    name: row.name,
    erc20AddressIn: row.erc20AddressIn,
    erc20AddressOut: row.erc20AddressOut,
    fee: row.fee,
    amountOut: row.amountOut,
    amountInMaximum: row.amountInMaximum,
    state: row.state,
    inIndex: row.inIndex,
    userCommitment: row.userCommitment,
    vaultAccount: row.vaultAccount,
    outcome: row.outcome,
    failure: row.failure,
    error: row.error,
    createTime: row.createTime,
    updateTime: row.updateTime,
  }
}
