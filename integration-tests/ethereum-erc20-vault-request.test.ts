import { randomUUID } from 'node:crypto'

import { requestIdHex } from '@sig-net/midnight'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { Backend } from '@/server/backend'

import { testBackend, uniqueCallerName } from './backend'

/**
 * The vault request repository over Postgres, the deposit reader over the running indexer, and
 * the resolver on a queued row the vault ledger does not hold. Everything beyond that needs a
 * request on chain, which the end-to-end deposit test drives.
 */
describe('Vault requests over Postgres, the indexer and the vault ledger', () => {
  let backend: Backend
  const caller = uniqueCallerName()
  const parent = `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`

  const request = (overrides: Partial<VaultRequest> = {}): VaultRequest => ({
    name: `${caller}/ethereum-erc20-vault-requests/${randomUUID()}`,
    parent,
    action: 'deposit',
    state: 'AwaitingFlush',
    inIndex: 2n ** 64n - 1n,
    depositAccount: `0x${'ab'.repeat(20)}`,
    outIndex: null,
    requestId: null,
    signedTx: null,
    attestationBlockHeight: null,
    attestationOutputKind: null,
    attestationDigest: null,
    attestationSignature: null,
    attestationOutput: null,
    createTime: new Date(),
    updateTime: new Date(),
    ...overrides,
  })

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await backend.db.pool.query('delete from midnight_transactions_v1 where parent like $1', [
      `${caller}/%`,
    ])
    await backend.db.pool.query(
      'delete from midnight_ethereum_erc20_vault_requests_v1 where name like $1',
      [`${caller}/%`],
    )
    await backend.db.pool.query('delete from event_outbox_entries_v1 where data::text like $1', [
      `%${caller}%`,
    ])
    await backend.db.pool.end()
  })

  test('create, get and search by parent round trip through the resource schema', async () => {
    const { repository } = backend.midnight.ethereumErc20Vault.vaultRequestV1
    const created = await repository.create(request())
    expect(await repository.get(created.name)).toEqual(created)
    const found = await repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: parent }],
      order: { field: 'createTime', direction: 'desc' },
      limit: 1,
    })
    expect(found).toEqual([created])
  })

  test('the live index refuses a second live request for the same parent and action', async () => {
    const { repository } = backend.midnight.ethereumErc20Vault.vaultRequestV1
    await expect(repository.create(request())).rejects.toThrow()
    const attested = await repository.create(
      request({ parent: `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}` }),
    )
    await repository.update({ ...attested, state: 'AwaitingSend', outIndex: '11'.repeat(32) })
    await expect(
      repository.create(request({ parent: attested.parent, state: 'AwaitingFlush' })),
    ).rejects.toThrow()
  })

  test('a starter maps the child live index refusing a retry to a state conflict', async () => {
    const { repository, stateController } = backend.midnight.ethereumErc20Vault.vaultRequestV1
    const { unitOfWork } = backend.db
    const row = await repository.create(
      request({
        parent: `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`,
        state: 'AwaitingSend',
        outIndex: '22'.repeat(32),
      }),
    )
    const child = await unitOfWork.runInTransaction(() =>
      stateController.startSend({ name: row.name, unprovenTx: 'aa' }),
    )
    expect(child).toMatchObject({ parent: row.name, circuit: 'sendDeposit', signer: 'relayer' })
    await expect(
      unitOfWork.runInTransaction(() =>
        stateController.startSend({ name: row.name, unprovenTx: 'bb' }),
      ),
    ).rejects.toMatchObject({ name: 'VaultRequestStateConflict' })
    expect((await repository.get(row.name))?.state).toBe('AwaitingSend')
  })

  test('the deposit reader finds no posts for a request the singleton never saw', async () => {
    const { signetReaders } = backend.midnight.ethereumErc20Vault
    const posts = await signetReaders.deposit.getRespondBidirectionalEvents(
      requestIdHex(crypto.getRandomValues(new Uint8Array(32))),
    )
    expect(posts).toEqual([])
  })

  test('a queued request the vault ledger does not hold is left alone', async () => {
    const { repository, stateResolver } = backend.midnight.ethereumErc20Vault.vaultRequestV1
    const row = await repository.create(
      request({ parent: `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}` }),
    )
    await stateResolver.resolveVaultRequest({ name: row.name })
    expect(await repository.get(row.name)).toEqual(row)
    expect(
      await backend.midnight.transactionV1.repository.search({
        criteria: [{ type: 'exact-text', field: 'parent', text: row.name }],
      }),
    ).toEqual([])
  })
})
