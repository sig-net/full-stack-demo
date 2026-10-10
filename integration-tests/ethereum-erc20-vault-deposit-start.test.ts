import { randomBytes } from 'node:crypto'

import { CIRCLE_USDC } from '@sig-net/midnight-examples-erc20-vault-contract'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { userWalletPublicKeys, userWalletSeed } from './user-wallet'

/**
 * A deposit started through the adaptor with a fresh caller secret and the user wallet's keys:
 * the start call is built against the running indexer, the row and its caller transaction are
 * stored, and the transaction resolver proves the call through the proof server. Nothing is
 * submitted to the chain, which the end-to-end deposit test does with the user wallet.
 */
describe('Starting a deposit over Postgres, the indexer and the proof server', () => {
  let backend: Backend
  const callerSecret = randomBytes(32).toString('hex')
  let caller: string | undefined
  let deposit: Deposit | undefined

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    if (caller !== undefined) {
      await backend.db.pool.query('delete from midnight_transactions_v1 where parent like $1', [
        `${caller}/%`,
      ])
      await backend.db.pool.query(
        'delete from midnight_ethereum_erc20_vault_deposits_v1 where name like $1',
        [`${caller}/%`],
      )
      await backend.db.pool.query(
        "delete from event_outbox_entries_v1 where convert_from(data, 'UTF8') like $1",
        [`%${caller}%`],
      )
    }
    await backend.db.pool.end()
  })

  test('startDeposit stores the deposit with its assigned fields and the caller start call', async () => {
    const { adaptor, repository } = backend.midnight.ethereumErc20Vault.depositV1
    const result = await adaptor.startDeposit(callerSecret, {
      depositRequest: { erc20Address: CIRCLE_USDC, amount: 1_000_000n },
      wallet: userWalletPublicKeys(userWalletSeed()),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    deposit = result.deposit
    caller = deposit.name.split('/').slice(0, 2).join('/')

    expect(deposit).toMatchObject({
      erc20Address: CIRCLE_USDC.toLowerCase(),
      amount: 1_000_000n,
      state: 'AwaitingStartTransaction',
      // A fresh caller's deposit account has never sent a transaction.
      evmNonce: 0n,
      gasLimit: 100_000n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      outcome: null,
      failure: null,
      error: null,
    })
    expect(deposit.depositAccount).toMatch(/^0x[0-9a-f]{40}$/)
    expect(deposit.inIndex).toBeLessThanOrEqual(2n ** 64n - 1n)
    expect(await repository.get(deposit.name)).toEqual(deposit)

    const [transaction] = await backend.midnight.transactionV1.repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: deposit.name }],
    })
    expect(transaction).toMatchObject({
      state: 'AwaitingProof',
      circuit: 'startDeposit',
      signer: 'caller',
      unboundTx: null,
      finalizedTx: null,
    })
    expect(transaction?.unprovenTx).toMatch(/^[0-9a-f]+$/)
    expect(transaction?.expireTime?.getTime()).toBeGreaterThan(Date.now() + 3_000_000)
  })

  test('the transaction resolver proves the start call through the proof server', async () => {
    if (deposit === undefined) throw new Error('startDeposit did not run')
    const { repository, stateResolver } = backend.midnight.transactionV1
    const [transaction] = await repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: deposit.name }],
    })
    if (transaction === undefined) throw new Error('no start transaction')

    await stateResolver.resolveTransaction({ name: transaction.name })

    const proven = await repository.get(transaction.name)
    expect(proven?.state).toBe('AwaitingWallet')
    expect(proven?.unprovenTx).toBeNull()
    expect(proven?.unboundTx).toMatch(/^[0-9a-f]+$/)

    const events = await backend.event.outboxEntryV1.repository.search({
      criteria: [],
      order: { field: 'createdAt', direction: 'asc' },
    })
    const ours = events.filter((entry) =>
      new TextDecoder().decode(entry.data).includes(deposit?.name ?? ''),
    )
    expect(ours.map((entry) => entry.type)).toEqual([
      'midnight.ethereum-erc20-vault.deposit-v1.awaiting-start-transaction',
      'midnight.transaction-v1.awaiting-proof',
      'midnight.transaction-v1.awaiting-wallet',
    ])
  })

  test('the deposit is listed for its caller and cannot be completed before its request is attested', async () => {
    if (deposit === undefined) throw new Error('startDeposit did not run')
    const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
    expect(await adaptor.listDeposits(callerSecret, {})).toEqual({ ok: true, deposits: [deposit] })
    expect(await adaptor.getDeposit(callerSecret, { name: deposit.name })).toEqual({
      ok: true,
      deposit,
    })
    expect(
      await adaptor.completeDeposit(callerSecret, {
        name: deposit.name,
        wallet: userWalletPublicKeys(userWalletSeed()),
      }),
    ).toEqual({
      ok: false,
      error: `${deposit.name} is AwaitingStartTransaction, which does not allow completeDeposit`,
    })
  })

  test('a token the vault does not allow is refused at build time, before anything is written', async () => {
    const { adaptor, repository } = backend.midnight.ethereumErc20Vault.depositV1
    const refused = await adaptor.startDeposit(callerSecret, {
      depositRequest: { erc20Address: `0x${'ab'.repeat(20)}`, amount: 1n },
      wallet: userWalletPublicKeys(userWalletSeed()),
    })
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/^failed assert: /) })
    if (deposit !== undefined) {
      expect(
        await repository.search({
          criteria: [{ type: 'exact-text', field: 'depositAccount', text: deposit.depositAccount }],
        }),
      ).toEqual([deposit])
    }
  })
})
