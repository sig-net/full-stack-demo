import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'

/**
 * The flusher over the real vault ledger, proof server and relayer wallet, with nothing queued:
 * the first flush assembles the relayer's provider set, which syncs the wallet, reads the queue
 * and submits nothing. A flush that moves an item needs a request on chain, which the end-to-end
 * deposit test queues.
 */
describe('The flusher over the vault ledger and the relayer wallet', () => {
  let backend: Backend

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await backend.db.pool.end()
  })

  test('with nothing queued, the first flush starts the relayer wallet and submits nothing', async () => {
    const { flusher, ledger } = backend.midnight.ethereumErc20Vault
    const { relayerWallet } = backend.midnight
    await expect(relayerWallet.finalize('00')).rejects.toThrow('was not started')
    const before = await ledger.state()
    expect({
      queuedRequests: before.inputRequestBuffer.size(),
      queuedAttestations: before.inputAttestationBuffer.size(),
    }).toEqual({ queuedRequests: 0n, queuedAttestations: 0n })

    await flusher.flush()

    await expect(relayerWallet.finalize('00')).rejects.toThrow('deserialize')
    const after = await ledger.state()
    expect(after.globalLastSeen).toBe(before.globalLastSeen)
    expect(after.vaultAccountNonce).toBe(before.vaultAccountNonce)
  })
})
