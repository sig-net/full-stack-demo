import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import { type DatabaseExecutor, getDatabase } from '@/lib/db/database'

/**
 * Runs `work` inside one database transaction that every repository call on the same async
 * chain joins. A call made while a transaction is already open joins it rather than nesting.
 * Work that detaches from the chain (an un-awaited promise, a timer callback) runs outside it.
 */
export async function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (transactions.getStore() !== undefined) return work()
  const database = await getDatabase()
  return database.transaction((transaction) => transactions.run(transaction, work))
}

/** The transaction open on the current async chain, if a write boundary opened one. */
export function currentTransaction(): DatabaseExecutor | undefined {
  return transactions.getStore()
}

const transactions = new AsyncLocalStorage<DatabaseExecutor>()
