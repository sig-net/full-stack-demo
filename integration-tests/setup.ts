import { existsSync } from 'node:fs'

// Next.js loads `.env.local` for the application, and the test runner has to load it itself.
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}
