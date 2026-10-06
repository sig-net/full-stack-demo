import 'server-only'

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { getServerConfig } from '@/lib/config/server-config'

async function createDatabase(): Promise<NodePgDatabase> {
  const { serverOnly } = await getServerConfig()
  return drizzle({ client: new Pool({ connectionString: serverOnly.dbConnectionString }) })
}

// One connection pool serves the whole server process.
let database: Promise<NodePgDatabase> | undefined

export function getDatabase(): Promise<NodePgDatabase> {
  database ??= createDatabase().catch((error: unknown) => {
    database = undefined
    throw error
  })
  return database
}
