import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  ssr: {
    resolve: {
      // `server-only` resolves to an empty module under this condition, as it does in Next.js's
      // server graph, so server modules load in the test runner.
      conditions: ['react-server', 'module', 'node', 'development|production'],
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Packages are normally loaded by Node directly, which ignores the condition above.
    server: { deps: { inline: ['server-only'] } },
  },
})
