import { randomBytes } from 'node:crypto'

import { Transaction } from '@midnightntwrk/ledger-v9'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { Backend } from '@/server/backend'

import { testBackend } from './backend'
import { CIRCLE_USDC } from './sepolia-tokens'
import { buildStartCall, startDepositAsUser } from './user-deposit'
import { startUserWallet, type UserWallet, userWalletSeed } from './user-wallet'

const DEPOSIT_REQUEST = { erc20Address: CIRCLE_USDC, amount: 1_000_000n }

/**
 * A deposit started as the browser starts it, with a fresh caller secret and the user wallet: the
 * start call is built against the running indexer, proved through the proof server and bound
 * without a fee, the row and its caller transaction are stored, and the relayer wallet pays the
 * fee. Nothing is submitted to the chain, which the end-to-end deposit test does.
 */
describe('Starting a deposit over Postgres, the indexer and the proof server', () => {
  let backend: Backend
  let user: UserWallet
  const callerSecret = randomBytes(32).toString('hex')
  let caller: string | undefined
  let deposit: Deposit | undefined

  beforeAll(async () => {
    backend = await testBackend()
    await backend.midnight.relayerWallet.start()
    user = await startUserWallet(userWalletSeed(), backend.config.client.midnightNetwork)
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
    await user.stop()
    await backend.db.pool.end()
  })

  test('prepareStartDeposit assigns a nonce of zero to a fresh caller', async () => {
    const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
    const prepared = await adaptor.prepareStartDeposit(callerSecret, {
      depositRequest: DEPOSIT_REQUEST,
      wallet: user.publicKeys,
    })
    expect(prepared).toMatchObject({
      ok: true,
      // A fresh caller's deposit account has never sent a transaction.
      inputs: {
        evmNonce: 0n,
        gasLimit: 100_000n,
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      },
    })
  })

  test('startDeposit stores the deposit with its assigned fields and the bound start call', async () => {
    const { repository } = backend.midnight.ethereumErc20Vault.depositV1
    const result = await startDepositAsUser(backend, callerSecret, user, DEPOSIT_REQUEST)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    deposit = result.deposit
    caller = deposit.name.split('/').slice(0, 2).join('/')

    expect(deposit).toMatchObject({
      erc20Address: CIRCLE_USDC.toLowerCase(),
      amount: 1_000_000n,
      state: 'AwaitingStartTransaction',
      evmNonce: 0n,
      gasLimit: 100_000n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      outcome: null,
      failure: null,
      error: null,
    })
    expect(deposit.depositAccount).toMatch(/^0x[0-9a-f]{40}$/)
    expect(deposit.recipient).toMatch(
      new RegExp(`^mn_shield-addr_${backend.config.client.midnightNetwork.networkId}1`),
    )
    expect(deposit.inIndex).toBeLessThanOrEqual(2n ** 64n - 1n)
    expect(await repository.get(deposit.name)).toEqual(deposit)

    const [transaction] = await backend.midnight.transactionV1.repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: deposit.name }],
    })
    expect(transaction).toMatchObject({
      state: 'AwaitingFee',
      circuit: 'startDeposit',
      signer: 'caller',
      unprovenTx: null,
      unboundTx: null,
      finalizedTx: null,
    })
    expect(transaction?.boundTx).toMatch(/^[0-9a-f]+$/)
    expect(transaction?.expireTime?.getTime()).toBeGreaterThan(Date.now() + 3_000_000)
  })

  test('the transaction resolver has the relayer wallet pay the start call fee', async () => {
    if (deposit === undefined) throw new Error('startDeposit did not run')
    const { repository, stateResolver } = backend.midnight.transactionV1
    const [transaction] = await repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: deposit.name }],
    })
    if (transaction === undefined) throw new Error('no start transaction')

    await stateResolver.resolveTransaction({ name: transaction.name })

    const paid = await repository.get(transaction.name)
    expect(paid?.state).toBe('AwaitingSubmission')
    expect(paid?.finalizedTx).toMatch(/^[0-9a-f]+$/)

    const events = await backend.event.outboxEntryV1.repository.search({
      criteria: [],
      order: { field: 'createdAt', direction: 'asc' },
    })
    const ours = events.filter((entry) =>
      new TextDecoder().decode(entry.data).includes(deposit?.name ?? ''),
    )
    expect(ours.map((entry) => entry.type)).toEqual([
      'midnight.ethereum-erc20-vault.deposit-v1.awaiting-start-transaction',
      'midnight.transaction-v1.awaiting-fee',
      'midnight.transaction-v1.awaiting-submission',
    ])
  })

  test('a start with a nonce below the assignment is refused and writes nothing', async () => {
    if (deposit === undefined) throw new Error('startDeposit did not run')
    const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
    const wallet = user.publicKeys
    const prepared = await adaptor.prepareStartDeposit(callerSecret, {
      depositRequest: DEPOSIT_REQUEST,
      wallet,
    })
    if (!prepared.ok) throw new Error(prepared.error)
    // The live deposit holds nonce zero, so the assignment is one.
    expect(prepared.inputs.evmNonce).toBe(1n)
    const stale = { ...prepared.inputs, evmNonce: prepared.inputs.evmNonce - 1n }
    const { boundTx } = await buildStartCall(backend, callerSecret, user, DEPOSIT_REQUEST, stale)
    const refused = await adaptor.startDeposit(callerSecret, {
      depositRequest: DEPOSIT_REQUEST,
      wallet,
      inIndex: stale.inIndex,
      evmNonce: stale.evmNonce,
      boundTx,
    })
    expect(refused).toEqual({
      ok: false,
      error: `the next nonce of ${deposit.depositAccount} moved since the start call was prepared: prepare and build it again`,
      reason: 'nonceConflict',
    })
    await expectOnlyTheStartedDeposit()
  })

  test('bound bytes that hold no vault call are refused and write nothing', async () => {
    if (deposit === undefined) throw new Error('startDeposit did not run')
    const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
    const empty = Transaction.fromParts(backend.config.client.midnightNetwork.networkId)
      .mockProve()
      .serialize()
    const refused = await adaptor.startDeposit(callerSecret, {
      depositRequest: DEPOSIT_REQUEST,
      wallet: user.publicKeys,
      inIndex: 1n,
      evmNonce: 1n,
      boundTx: Buffer.from(empty).toString('hex'),
    })
    expect(refused).toEqual({
      ok: false,
      error:
        'the bound bytes must be exactly one startDeposit call to the vault, spending no coins',
    })
    await expectOnlyTheStartedDeposit()
  })

  test('the deposit is listed for its caller and cannot be completed before its request is attested', async () => {
    if (deposit === undefined) throw new Error('startDeposit did not run')
    const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
    const current = await backend.midnight.ethereumErc20Vault.depositV1.repository.get(deposit.name)
    expect(await adaptor.listDeposits(callerSecret, {})).toEqual({
      ok: true,
      deposits: [current],
    })
    expect(await adaptor.getDeposit(callerSecret, { name: deposit.name })).toEqual({
      ok: true,
      deposit: current,
    })
    expect(
      await adaptor.prepareCompleteDeposit(callerSecret, {
        name: deposit.name,
        wallet: user.publicKeys,
      }),
    ).toEqual({
      ok: false,
      error: `${deposit.name} is AwaitingStartTransaction, which does not allow complete`,
    })
  })

  test('a token the vault does not allow is refused by the circuit while the call is built', async () => {
    const building = startDepositAsUser(backend, callerSecret, user, {
      erc20Address: `0x${'ab'.repeat(20)}`,
      amount: 1n,
    })
    await expect(building).rejects.toThrow(/^failed assert: /)
    await expectOnlyTheStartedDeposit()
  })

  /** The deposit the start test stored is the only row under the caller's deposit account. */
  async function expectOnlyTheStartedDeposit(): Promise<void> {
    if (deposit === undefined) throw new Error('startDeposit did not run')
    const { repository } = backend.midnight.ethereumErc20Vault.depositV1
    const stored = await repository.search({
      criteria: [{ type: 'exact-text', field: 'depositAccount', text: deposit.depositAccount }],
    })
    expect(stored.map(({ name }) => name)).toEqual([deposit.name])
    const transactions = await backend.midnight.transactionV1.repository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: deposit.name }],
    })
    expect(transactions).toHaveLength(1)
  }
})
