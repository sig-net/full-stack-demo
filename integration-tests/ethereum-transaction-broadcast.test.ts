import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'

import { type HDNodeWallet, JsonRpcProvider, Wallet } from 'ethers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Backend } from '@/server/backend'

import { testBackend, uniqueCallerName } from './backend'

/**
 * A signed transfer committed in AwaitingSubmission is broadcast by the resolver to the anvil
 * fork, watched to inclusion and recorded, with every lifecycle event in the outbox. A second
 * transfer at the same nonce can never mine and ends Failed as NonceConsumed.
 */
describe('EthereumTransactionStateResolver over Postgres and the anvil fork', () => {
  let backend: Backend
  let provider: JsonRpcProvider
  let wallet: HDNodeWallet
  const caller = uniqueCallerName()

  beforeAll(async () => {
    backend = await testBackend()
    provider = new JsonRpcProvider(backend.config.client.ethereum.rpcURL)
    wallet = Wallet.createRandom()
    await provider.send('anvil_setBalance', [wallet.address, `0x${(10n ** 18n).toString(16)}`])
  })

  afterAll(async () => {
    provider.destroy()
    await backend.db.pool.query('delete from ethereum_transactions_v1 where parent like $1', [
      `${caller}/%`,
    ])
    await backend.db.pool.query('delete from event_outbox_entries_v1 where data::text like $1', [
      `%${caller}%`,
    ])
    await backend.db.pool.end()
  })

  /** A self-transfer of `value` wei at nonce 0, signed by the funded wallet. */
  function signSelfTransfer(value: bigint): Promise<string> {
    return wallet.signTransaction({
      type: 2,
      chainId: backend.config.client.ethereum.chainId,
      nonce: 0,
      to: wallet.address,
      value,
      gasLimit: 21_000,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    })
  }

  async function commit(signedTx: string): Promise<string> {
    const { stateController } = backend.ethereum.transactionV1
    const name = `${caller}/ethereum-transactions/${randomUUID()}`
    const now = new Date()
    await backend.db.unitOfWork.runInTransaction(() =>
      stateController.commitTransaction({
        transaction: {
          name,
          parent: `${caller}/ethereum-erc20-vault-requests/${randomUUID()}`,
          state: 'AwaitingSubmission',
          signedTx,
          txHash: null,
          blockNumber: null,
          expireTime: new Date(now.getTime() + 3_600_000),
          failure: null,
          error: null,
          createTime: now,
          updateTime: now,
        },
      }),
    )
    return name
  }

  /** Resolves until the row reaches `state`, since anvil mines a block every second. */
  async function resolveUntil(name: string, state: string, attempts = 30) {
    const { repository, stateResolver } = backend.ethereum.transactionV1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await stateResolver.resolveTransaction({ name })
      const current = await repository.get(name)
      if (current?.state === state) return current
      await sleep(500)
    }
    return repository.get(name)
  }

  async function eventTypes(name: string): Promise<string[]> {
    const events = await backend.event.outboxEntryV1.repository.search({
      criteria: [],
      order: { field: 'createdAt', direction: 'asc' },
    })
    return events
      .filter((entry) => new TextDecoder().decode(entry.data).includes(name))
      .map((entry) => entry.type)
  }

  test('commit, resolve to inclusion, and the row and the outbox show the lifecycle', async () => {
    const { repository, stateResolver } = backend.ethereum.transactionV1
    const name = await commit(await signSelfTransfer(0n))

    await stateResolver.resolveTransaction({ name })
    const submitted = await repository.get(name)
    expect(submitted?.state).toBe('AwaitingInclusion')
    expect(submitted?.txHash).toMatch(/^0x[0-9a-f]{64}$/)

    const mined = await resolveUntil(name, 'Succeeded')
    expect(mined?.state).toBe('Succeeded')
    expect(mined?.txHash).toBe(submitted?.txHash)
    expect(mined?.blockNumber).toBeGreaterThan(0n)
    expect(mined?.failure).toBeNull()

    // A terminal transaction is left alone.
    await stateResolver.resolveTransaction({ name })
    expect(await repository.get(name)).toEqual(mined)

    expect(await eventTypes(name)).toEqual([
      'ethereum.transaction-v1.awaiting-submission',
      'ethereum.transaction-v1.awaiting-inclusion',
      'ethereum.transaction-v1.succeeded',
    ])
  })

  test('a second transaction at a consumed nonce ends Failed as NonceConsumed', async () => {
    const { repository, stateResolver } = backend.ethereum.transactionV1
    expect(await provider.getTransactionCount(wallet.address, 'latest')).toBe(1)
    const name = await commit(await signSelfTransfer(1n))

    // The node refuses the nonce, which the ledger treats as already submitted.
    await stateResolver.resolveTransaction({ name })
    expect((await repository.get(name))?.state).toBe('AwaitingInclusion')

    await stateResolver.resolveTransaction({ name })
    const failed = await repository.get(name)
    expect(failed?.state).toBe('Failed')
    expect(failed?.failure).toBe('NonceConsumed')
    expect(failed?.blockNumber).toBeNull()

    expect(await eventTypes(name)).toEqual([
      'ethereum.transaction-v1.awaiting-submission',
      'ethereum.transaction-v1.awaiting-inclusion',
      'ethereum.transaction-v1.failed',
    ])
  })
})
