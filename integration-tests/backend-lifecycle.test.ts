import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'

/**
 * The backend's start and stop over the real stack: `start()` begins the relayer wallet's sync,
 * the hub's Kafka loop, the outbox relay and the sweep, the sweep's first pass runs every
 * resolver and the flusher against the running services, and `stop()` ends the loops and
 * releases what they held, so the test process exits on its own.
 */
describe('The backend lifecycle over Kafka, Postgres and the relayer wallet', () => {
  let backend: Backend

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await backend.db.pool.end()
  })

  test('start runs once, syncs the wallet and sweeps, and stop ends every loop', async () => {
    const logged = vi.spyOn(console, 'log')
    try {
      const { pool } = backend.db
      const started = Date.now()
      const first = backend.start()
      expect(backend.start()).toBe(first)
      await first

      await backend.midnight.relayerWallet.provider()
      console.log(`relayer wallet synced ${String(Date.now() - started)} ms after start`)

      // The sweep's first pass ends with a flush, which waits for the wallet and the prover keys.
      await vi.waitFor(
        () => {
          expect(logged).toHaveBeenCalledWith(expect.stringMatching(/^Sweep ran its first pass/))
        },
        { timeout: 90_000, interval: 250 },
      )
      // The outbox relay holds one pool client for its LISTEN for as long as it runs.
      expect(pool.totalCount - pool.idleCount).toBeGreaterThanOrEqual(1)

      const stopping = Date.now()
      await backend.stop()
      console.log(`backend stopped in ${String(Date.now() - stopping)} ms`)
      expect(pool.totalCount - pool.idleCount).toBe(0)

      // A second stop has nothing left to end.
      await backend.stop()
    } finally {
      logged.mockRestore()
    }
  })
})
