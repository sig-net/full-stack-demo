import 'server-only'

import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { midnightErc20VaultDepositsV1 } from '@/lib/db/schema'
import type { Deposit } from '@/lib/midnight/erc20-vault/deposit-v1/deposit'
import type { DepositRepository } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-repository'
import { getDatabase } from '@/lib/db/database'

type DepositRow = typeof midnightErc20VaultDepositsV1.$inferSelect

export function toDepositRow(deposit: Deposit): DepositRow {
  return { name: deposit.name, erc20Address: deposit.erc20Address, amount: deposit.amount }
}

export function fromDepositRow(row: DepositRow): Deposit {
  return { name: row.name, erc20Address: row.erc20Address, amount: row.amount }
}

export class DepositRepositorySQLImpl implements DepositRepository {
  private readonly database: NodePgDatabase

  constructor(database: NodePgDatabase) {
    this.database = database
  }

  async createDeposit(deposit: Deposit): Promise<Deposit> {
    const row = toDepositRow(deposit)
    const [stored] = await this.database
      .insert(midnightErc20VaultDepositsV1)
      .values(row)
      .returning()
    if (stored === undefined) {
      throw new Error('The create returned no row')
    }
    return fromDepositRow(stored)
  }

  async getDeposit(name: string): Promise<Deposit | undefined> {
    const [row] = await this.database
      .select()
      .from(midnightErc20VaultDepositsV1)
      .where(eq(midnightErc20VaultDepositsV1.name, name))
      .limit(1)
    return row === undefined ? undefined : fromDepositRow(row)
  }
}

// One instance serves the whole server process.
let depositRepository: Promise<DepositRepository> | undefined

export function getDepositRepository(): Promise<DepositRepository> {
  depositRepository ??= (async () => {
    try {
      const database = await getDatabase()
      return new DepositRepositorySQLImpl(database)
    } catch (error) {
      depositRepository = undefined
      throw error
    }
  })()
  return depositRepository
}
