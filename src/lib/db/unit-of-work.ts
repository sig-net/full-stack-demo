import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { DatabaseExecutor } from '@/lib/db/database'

/** Opens database transactions that every repository call on the same async chain joins. */
export class UnitOfWork {
  private readonly database: NodePgDatabase

  constructor(database: NodePgDatabase) {
    this.database = database
  }

  /**
   * Runs `work` inside one transaction. A call made while a transaction is already open joins it
   * rather than nesting. Work that detaches from the chain (an un-awaited promise, a timer
   * callback) runs outside it.
   */
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (transactions.getStore() !== undefined) return work()
    return this.database.transaction((transaction) => transactions.run(transaction, work))
  }
}

/** The transaction open on the current async chain, if a write boundary opened one. */
export function currentTransaction(): DatabaseExecutor | undefined {
  return transactions.getStore()
}

const transactions = new AsyncLocalStorage<DatabaseExecutor>()
