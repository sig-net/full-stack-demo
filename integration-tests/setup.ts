import { existsSync } from 'node:fs'

// The application reads `.env.local` through Next.js; the test runner has to load it itself.
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}
