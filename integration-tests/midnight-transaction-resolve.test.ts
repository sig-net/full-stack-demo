import { randomUUID } from 'node:crypto'

import { Transaction } from '@midnightntwrk/ledger-v9'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend, uniqueCallerName } from './backend'

/**
 * A transaction committed in AwaitingProof is proven by the resolver through the real proof
 * server and stored in AwaitingWallet, with both lifecycle events in the outbox.
 */
describe('MidnightTransactionStateResolver over Postgres and the proof server', () => {
  let backend: Backend
  const caller = uniqueCallerName()

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await backend.db.pool.query('delete from midnight_transactions_v1 where parent like $1', [
      `${caller}/%`,
    ])
    await backend.db.pool.query(
      "delete from event_outbox_entries_v1 where convert_from(data, 'UTF8') like $1",
      [`%${caller}%`],
    )
    await backend.db.pool.end()
  })

  test('commit, resolve, and the row and the outbox show the proof', async () => {
    const { repository, stateController, stateResolver } = backend.midnight.transactionV1
    const { unitOfWork } = backend.db
    const { networkId } = backend.config.client.midnightNetwork
    const name = `${caller}/midnight-transactions/${randomUUID()}`
    const parent = `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`
    const now = new Date()

    await unitOfWork.runInTransaction(() =>
      stateController.commitTransaction({
        transaction: {
          name,
          parent,
          state: 'AwaitingProof',
          circuit: 'startDeposit',
          signer: 'caller',
          unprovenTx: Buffer.from(Transaction.fromParts(networkId).serialize()).toString('hex'),
          unboundTx: null,
          finalizedTx: null,
          expireTime: new Date(now.getTime() + 3_600_000),
          txId: null,
          failure: null,
          error: null,
          createTime: now,
          updateTime: now,
        },
      }),
    )

    await stateResolver.resolveTransaction({ name })

    const resolved = await repository.get(name)
    expect(resolved?.state).toBe('AwaitingWallet')
    expect(resolved?.unprovenTx).toBeNull()
    expect(resolved?.unboundTx).toMatch(/^[0-9a-f]+$/)

    const events = await backend.event.outboxEntryV1.repository.search({
      criteria: [],
      order: { field: 'createdAt', direction: 'asc' },
    })
    const ours = events.filter((entry) => new TextDecoder().decode(entry.data).includes(name))
    expect(ours.map((entry) => entry.type)).toEqual([
      'midnight.transaction-v1.awaiting-proof',
      'midnight.transaction-v1.awaiting-wallet',
    ])

    // Resolving again finds nothing to do: the user holds the next step.
    await stateResolver.resolveTransaction({ name })
    expect((await repository.get(name))?.state).toBe('AwaitingWallet')
  })
})
