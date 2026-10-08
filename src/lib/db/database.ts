import 'server-only'

import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

import { getServerConfig } from '@/lib/config/server-config'
import { lazySingleton } from '@/lib/lazy-singleton'

/** One connection pool serves the whole server process. */
export const getDatabase: () => Promise<NodePgDatabase> = lazySingleton(async () => {
  const pool = await getDatabasePool()
  return drizzle({ client: pool })
})

/**
 * The database itself, or a transaction opened on it: a repository method runs on whichever it is
 * given, so one database transaction can span several repositories.
 */
export type DatabaseExecutor = PgDatabase<NodePgQueryResultHKT>

/** The pool behind the database, for work that needs a dedicated client such as `LISTEN`. */
export const getDatabasePool: () => Promise<Pool> = lazySingleton(async () => {
  const { serverOnly } = await getServerConfig()
  return new Pool({ connectionString: serverOnly.dbConnectionString })
})
