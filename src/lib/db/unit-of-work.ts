import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { DatabaseExecutor } from '@/lib/db/database'
import { caughtError, type Logger } from '@/lib/logging/logger'

/** Opens database transactions that every repository call on the same async chain joins. */
export class UnitOfWork {
  private readonly database: NodePgDatabase
  private readonly logger: Logger

  constructor(database: NodePgDatabase, logger: Logger) {
    this.database = database
    this.logger = logger
  }

  /**
   * Runs `work` inside one transaction. A call made while a transaction is already open joins it
   * rather than nesting. Work that detaches from the chain (an un-awaited promise, a timer
   * callback) runs outside it.
   */
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (transactions.getStore() !== undefined) return work()
    const started = Date.now()
    this.logger.debug('transaction opened')
    try {
      const result = await this.database.transaction((transaction) =>
        transactions.run(transaction, work),
      )
      this.logger.debug('transaction committed', { durationMs: Date.now() - started })
      return result
    } catch (error: unknown) {
      this.logger.debug('transaction rolled back', {
        durationMs: Date.now() - started,
        err: caughtError(error),
      })
      throw error
    }
  }
}

/** The transaction open on the current async chain, if a write boundary opened one. */
export function currentTransaction(): DatabaseExecutor | undefined {
  return transactions.getStore()
}

const transactions = new AsyncLocalStorage<DatabaseExecutor>()
