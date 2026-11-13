// Applies the `drizzle` migration to the database at DB_CONNECTION_STRING. The production image
// runs it before the server starts, where drizzle-kit is absent, so it imports only production
// dependencies and runs from the image's working directory, where `drizzle` sits.

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const connectionString = process.env.DB_CONNECTION_STRING
if (connectionString === undefined) {
  throw new Error('DB_CONNECTION_STRING is required')
}

const pool = new Pool({ connectionString })
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: 'drizzle' })
} finally {
  await pool.end()
}
