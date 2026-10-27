import { defineConfig } from 'vitest/config'

import unitConfig from './vitest.config'

/** Integration tests need the local services from `compose.yaml` and the Midnight stack. */
export default defineConfig({
  resolve: unitConfig.resolve,
  ssr: unitConfig.ssr,
  test: {
    include: ['integration-tests/**/*.test.ts'],
    setupFiles: ['integration-tests/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // The tests share one Postgres and one Kafka, so files run one at a time.
    fileParallelism: false,
  },
})
