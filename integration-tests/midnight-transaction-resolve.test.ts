import { randomUUID } from 'node:crypto'

import { Transaction } from '@midnightntwrk/ledger-v9'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend, uniqueCallerName } from './backend'

/**
 * A transaction committed in AwaitingProof is proven by the resolver through the real proof
 * server and stored in AwaitingWallet, and one committed bound in AwaitingFee is paid for by the
 * relayer wallet and stored in AwaitingSubmission, each with its lifecycle events in the outbox.
 * The relayer wallet is started on its own, since a started backend would also submit.
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

  test('commit, resolve, and the row and the outbox show the proof', async () => {
    const { repository, stateController, stateResolver } = backend.midnight.transactionV1
    const { unitOfWork } = backend.db
    const { networkId } = backend.config.client.midnightNetwork
    const name = `${caller}/midnight-transactions/${randomUUID()}`
    const parent = `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`

    await unitOfWork.runInTransaction(() =>
      stateController.commitTransaction({
        name,
        parent,
        circuit: 'startDeposit',
        signer: 'caller',
        unprovenTx: Buffer.from(Transaction.fromParts(networkId).serialize()).toString('hex'),
      }),
    )

    await stateResolver.resolveTransaction({ name })

    const resolved = await repository.get(name)
    expect(resolved?.state).toBe('AwaitingWallet')
    expect(resolved?.unprovenTx).toBeNull()
    expect(resolved?.unboundTx).toMatch(/^[0-9a-f]+$/)
    expect(resolved?.boundTx).toBeNull()

    expect(await outboxTrail(backend, name)).toEqual([
      'midnight.transaction-v1.awaiting-proof',
      'midnight.transaction-v1.awaiting-wallet',
    ])

    // Resolving again finds nothing to do: the user holds the next step.
    await stateResolver.resolveTransaction({ name })
    expect((await repository.get(name))?.state).toBe('AwaitingWallet')
  })

  test('commit bound, resolve, and the row and the outbox show the relayer paid the fee', async () => {
    const { repository, stateController, stateResolver } = backend.midnight.transactionV1
    const { unitOfWork } = backend.db
    const { networkId } = backend.config.client.midnightNetwork
    const name = `${caller}/midnight-transactions/${randomUUID()}`
    const parent = `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`
    const boundTx = Buffer.from(Transaction.fromParts(networkId).mockProve().serialize()).toString(
      'hex',
    )

    await unitOfWork.runInTransaction(() =>
      stateController.commitTransaction({
        name,
        parent,
        circuit: 'startDeposit',
        signer: 'caller',
        boundTx,
      }),
    )

    await stateResolver.resolveTransaction({ name })

    const resolved = await repository.get(name)
    expect(resolved?.state).toBe('AwaitingSubmission')
    expect(resolved?.unprovenTx).toBeNull()
    expect(resolved?.unboundTx).toBeNull()
    expect(resolved?.boundTx).toBe(boundTx)
    expect(resolved?.finalizedTx).toMatch(/^[0-9a-f]+$/)
    expect(resolved?.finalizedTx).not.toBe(boundTx)

    expect(await outboxTrail(backend, name)).toEqual([
      'midnight.transaction-v1.awaiting-fee',
      'midnight.transaction-v1.awaiting-submission',
    ])
  })
})

/** The lifecycle event types the outbox holds for one transaction, oldest first. */
async function outboxTrail(backend: Backend, name: string): Promise<string[]> {
  const events = await backend.event.outboxEntryV1.repository.search({
    criteria: [],
    order: { field: 'createdAt', direction: 'asc' },
  })
  return events
    .filter((entry) => new TextDecoder().decode(entry.data).includes(name))
    .map((entry) => entry.type)
}
