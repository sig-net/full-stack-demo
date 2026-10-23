import 'server-only'

import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

export function createDatabase(pool: Pool): NodePgDatabase {
  return drizzle({ client: pool })
}

export function createDatabasePool(connectionString: string): Pool {
  return new Pool({ connectionString })
}

/**
 * The database itself, or a transaction opened on it: a repository method runs on whichever it is
 * given, so one database transaction can span several repositories.
 */
export type DatabaseExecutor = PgDatabase<NodePgQueryResultHKT>
