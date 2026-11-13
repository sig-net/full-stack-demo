// Configuration for the drizzle-kit command line tool, which reads this file when `yarn db:generate`
// or `yarn db:migrate` runs. The application never imports it: its queries go through
// src/lib/db/database.ts.

import { existsSync } from 'node:fs'

import { defineConfig } from 'drizzle-kit'

// Those commands are plain Node.js processes, where nothing loads .env.local automatically the way
// `next dev` does for the application.
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const url = process.env.DB_CONNECTION_STRING
if (url === undefined) {
  throw new Error('DB_CONNECTION_STRING is required')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
})
