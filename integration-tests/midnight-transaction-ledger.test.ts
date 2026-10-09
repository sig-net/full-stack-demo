import { Transaction } from '@midnightntwrk/ledger-v9'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend } from './backend'

/** The ledger implementation against the configured proof server and indexer. */
describe('TransactionLedgerMidnightImpl against the Midnight services', () => {
  let backend: Backend

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await backend.db.pool.end()
  })

  test('an identifier the ledger never saw is pending', async () => {
    const { ledger } = backend.midnight.transactionV1
    expect(await ledger.status('00'.repeat(32))).toEqual({ outcome: 'pending' })
  })

  test('an empty transaction proves through the proof server and comes back as unbound bytes', async () => {
    const { ledger } = backend.midnight.transactionV1
    const { networkId } = backend.config.client.midnightNetwork
    const unproven = Buffer.from(Transaction.fromParts(networkId).serialize()).toString('hex')
    const unbound = await ledger.prove(unproven)
    expect(unbound).toMatch(/^[0-9a-f]+$/)
    expect(() =>
      Transaction.deserialize('signature', 'proof', 'pre-binding', Buffer.from(unbound, 'hex')),
    ).not.toThrow()
  })
})
