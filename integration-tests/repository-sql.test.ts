import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { Backend } from '@/server/backend'

import { testBackend, uniqueCallerName } from './backend'

/** The golden repository against Postgres: the SQL base class through the deposit repository. */
describe('SQLRepository over Postgres', () => {
  let backend: Backend
  const caller = uniqueCallerName()

  const deposit = (overrides: Partial<Deposit> = {}): Deposit => ({
    name: `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`,
    erc20Address: `0x${'ab'.repeat(20)}`,
    amount: 5n,
    state: 'AwaitingStartTransaction',
    inIndex: 1n,
    evmNonce: 0n,
    gasLimit: 21_000n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    depositAccount: `0x${'cd'.repeat(20)}`,
    outcome: null,
    failure: null,
    error: null,
    createTime: new Date(),
    updateTime: new Date(),
    ...overrides,
  })

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    await backend.db.pool.query(
      'delete from midnight_ethereum_erc20_vault_deposits_v1 where name like $1',
      [`${caller}/%`],
    )
    await backend.db.pool.end()
  })

  test('create, get, update and search round trip through the resource schema', async () => {
    const { repository } = backend.midnight.ethereumErc20Vault.depositV1
    const created = await repository.create(deposit({ amount: 2n ** 64n - 1n }))
    expect(await repository.get(created.name)).toEqual(created)
    expect(
      await repository.get(`${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`),
    ).toBeUndefined()

    const updated = await repository.update({ ...created, amount: 7n })
    expect(updated.amount).toBe(7n)
    await expect(repository.update(deposit())).rejects.toThrow('does not exist')
    await expect(repository.create(created)).rejects.toThrow()

    await repository.create(deposit({ amount: 9n }))
    const found = await repository.search({
      criteria: [{ type: 'exact-text', field: 'erc20Address', text: `0x${'ab'.repeat(20)}` }],
      order: { field: 'amount', direction: 'desc' },
      limit: 1,
    })
    expect(found.map((row) => row.amount)).toEqual([9n])
  })

  test('a malformed stored row is refused on read', async () => {
    const { repository } = backend.midnight.ethereumErc20Vault.depositV1
    const name = `${caller}/ethereum-erc20-vault-deposits/${randomUUID()}`
    await backend.db.pool.query(
      `insert into midnight_ethereum_erc20_vault_deposits_v1
         (name, erc20_address, amount, state, in_index, evm_nonce, gas_limit, max_fee_per_gas,
          max_priority_fee_per_gas, deposit_account, create_time, update_time)
       values ($1, 'not-an-address', 0, 'AwaitingStartTransaction', 0, 0, 0, 0, 0, $2, now(), now())`,
      [name, `0x${'cd'.repeat(20)}`],
    )
    await expect(repository.get(name)).rejects.toThrow()
  })

  test('a skip-locked search claims rows a concurrent transaction cannot see', async () => {
    const { repository } = backend.midnight.ethereumErc20Vault.depositV1
    const { unitOfWork } = backend.db
    const claimed = await repository.create(deposit({ erc20Address: `0x${'cd'.repeat(20)}` }))
    const criteria = [
      { type: 'exact-text' as const, field: 'erc20Address' as const, text: `0x${'cd'.repeat(20)}` },
    ]
    // Captured before any transaction is open, so work run through it opens its own.
    const outside = AsyncLocalStorage.snapshot()
    await unitOfWork.runInTransaction(async () => {
      const mine = await repository.search({ criteria, lock: 'update-skip-locked' })
      expect(mine.map((row) => row.name)).toEqual([claimed.name])
      const theirs = await outside(() =>
        unitOfWork.runInTransaction(() =>
          repository.search({ criteria, lock: 'update-skip-locked' }),
        ),
      )
      expect(theirs).toEqual([])
    })
  })
})
