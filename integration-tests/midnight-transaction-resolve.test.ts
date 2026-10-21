import { randomUUID } from 'node:crypto'

import { Transaction } from '@midnightntwrk/ledger-v9'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend, uniqueCallerName } from './backend'
import { outboxTrail } from './outbox-trail'

/**
 * A relayer transaction committed in AwaitingProof is proven by the resolver through the real
 * proof server, finalised by the relayer wallet and stored in AwaitingSubmission, with its
 * lifecycle events in the outbox. The relayer wallet is started on its own, since a started
 * backend would also submit, and the bytes are never submitted: the unsubmitted finalisation
 * holds the relayer's one DUST coin until the process ends.
 */
describe('MidnightTransactionStateResolver over Postgres, the proof server and the relayer wallet', () => {
  let backend: Backend
  const caller = uniqueCallerName()

  beforeAll(async () => {
    backend = await testBackend()
    await backend.midnight.relayerWallet.start()
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

  test('commit unproven, resolve, and the row and the outbox show the proof and the relayer signature', async () => {
    const { repository, stateController, stateResolver } = backend.midnight.transactionV1
    const { unitOfWork } = backend.db
    const { networkId } = backend.config.client.midnightNetwork
    const name = `${caller}/midnight-transactions/${randomUUID()}`
    const parent = `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`

    await unitOfWork.runInTransaction(() =>
      stateController.commitTransaction({
        name,
        parent,
        circuit: 'sendDeposit',
        signer: 'relayer',
        unprovenTx: Buffer.from(Transaction.fromParts(networkId).serialize()).toString('hex'),
      }),
    )

    // The resolver takes one step per call: the proof, then the relayer wallet's signature.
    await stateResolver.resolveTransaction({ name })
    const proven = await repository.get(name)
    expect(proven?.state).toBe('AwaitingWallet')
    expect(proven?.unprovenTx).toBeNull()
    expect(proven?.unboundTx).toMatch(/^[0-9a-f]+$/)

    await stateResolver.resolveTransaction({ name })
    const signed = await repository.get(name)
    expect(signed?.state).toBe('AwaitingSubmission')
    expect(signed?.finalizedTx).toMatch(/^[0-9a-f]+$/)

    expect(await outboxTrail(backend, name)).toEqual([
      'midnight.transaction-v1.awaiting-proof',
      'midnight.transaction-v1.awaiting-wallet',
      'midnight.transaction-v1.awaiting-submission',
    ])
  })
})
