import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { Backend } from '@/server/backend'

import { testBackend, uniqueCallerName } from './backend'

/**
 * The activity view over Postgres: each deposit projected with the newest child of each kind,
 * the states aggregated by the database, read back through the read-only repository.
 */
describe('The activity view over Postgres', () => {
  let backend: Backend
  const caller = uniqueCallerName()
  const depositAccount = `0x${'cd'.repeat(20)}`
  const at = (minute: number): Date => new Date(Date.UTC(2026, 0, 1, 0, minute))

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
    depositAccount,
    outcome: null,
    failure: null,
    error: null,
    createTime: at(0),
    updateTime: at(0),
    ...overrides,
  })

  const midnightTransaction = (
    parent: string,
    circuit: string,
    overrides: Partial<MidnightTransaction> = {},
  ): MidnightTransaction => ({
    name: `${caller}/midnight-transactions/${randomUUID()}`,
    parent,
    state: 'AwaitingProof',
    circuit,
    signer: 'caller',
    unprovenTx: 'aa',
    unboundTx: null,
    finalizedTx: null,
    expireTime: null,
    txId: null,
    failure: null,
    error: null,
    createTime: at(1),
    updateTime: at(1),
    ...overrides,
  })

  const vaultRequest = (parent: string, overrides: Partial<VaultRequest> = {}): VaultRequest => ({
    name: `${caller}/ethereum-erc20-vault-requests/${randomUUID()}`,
    parent,
    action: 'deposit',
    state: 'AwaitingFlush',
    inIndex: 1n,
    depositAccount,
    outIndex: null,
    requestId: null,
    signedTx: null,
    attestationBlockHeight: null,
    attestationOutputKind: null,
    attestationDigest: null,
    attestationSignature: null,
    attestationOutput: null,
    createTime: at(3),
    updateTime: at(3),
    ...overrides,
  })

  const ethereumTransaction = (
    parent: string,
    overrides: Partial<EthereumTransaction> = {},
  ): EthereumTransaction => ({
    name: `${caller}/ethereum-transactions/${randomUUID()}`,
    parent,
    state: 'AwaitingSubmission',
    signedTx: '0x02',
    txHash: null,
    blockNumber: null,
    expireTime: null,
    failure: null,
    error: null,
    createTime: at(4),
    updateTime: at(4),
    ...overrides,
  })

  beforeAll(async () => {
    backend = await testBackend()
  })

  afterAll(async () => {
    const { pool } = backend.db
    for (const table of ['midnight_transactions_v1', 'ethereum_transactions_v1']) {
      await pool.query(`delete from ${table} where parent like $1`, [`${caller}/%`])
    }
    for (const table of [
      'midnight_ethereum_erc20_vault_requests_v1',
      'midnight_ethereum_erc20_vault_deposits_v1',
    ]) {
      await pool.query(`delete from ${table} where name like $1`, [`${caller}/%`])
    }
    await pool.end()
  })

  test('projects the newest child of each kind and aggregates the states', async () => {
    const { midnight, ethereum } = backend
    const { depositV1, vaultRequestV1, activityV1 } = midnight.ethereumErc20Vault
    const row = await depositV1.repository.create(deposit({ state: 'AwaitingCompleteTransaction' }))
    await midnight.transactionV1.repository.create(
      midnightTransaction(row.name, 'startDeposit', {
        state: 'Failed',
        unprovenTx: null,
        failure: 'Rejected',
        error: 'refused',
      }),
    )
    await midnight.transactionV1.repository.create(
      midnightTransaction(row.name, 'startDeposit', {
        state: 'Succeeded',
        unprovenTx: null,
        unboundTx: 'bb',
        finalizedTx: 'cc',
        txId: 'start-2',
        createTime: at(2),
        updateTime: at(2),
      }),
    )
    const request = await vaultRequestV1.repository.create(
      vaultRequest(row.name, {
        state: 'AwaitingAttestation',
        outIndex: '11'.repeat(32),
        requestId: '22'.repeat(32),
        signedTx: '0x02',
        updateTime: at(5),
      }),
    )
    await ethereum.transactionV1.repository.create(
      ethereumTransaction(request.name, {
        state: 'Succeeded',
        txHash: `0x${'33'.repeat(32)}`,
        blockNumber: 7n,
        updateTime: at(6),
      }),
    )
    await midnight.transactionV1.repository.create(
      midnightTransaction(row.name, 'completeDeposit', {
        state: 'AwaitingInclusion',
        unprovenTx: null,
        unboundTx: 'bb',
        finalizedTx: 'cc',
        txId: 'complete-1',
        createTime: at(7),
        updateTime: at(8),
      }),
    )

    expect(await activityV1.repository.get(row.name)).toEqual({
      name: row.name,
      type: 'Deposit',
      state: 'Pending',
      depositAccount,
      erc20Address: row.erc20Address,
      amount: 5n,
      outcome: null,
      error: null,
      startTransaction: { hash: 'start-2', state: 'Succeeded' },
      foreignChainTransaction: { hash: `0x${'33'.repeat(32)}`, state: 'Succeeded' },
      completeTransaction: { hash: 'complete-1', state: 'Pending' },
      createTime: at(0),
      updateTime: at(8),
    })
  })

  test('a deposit without children has no transactions, and a completed one is Complete', async () => {
    const { depositV1, activityV1 } = backend.midnight.ethereumErc20Vault
    const bare = await depositV1.repository.create(
      deposit({ createTime: at(10), updateTime: at(10) }),
    )
    const completed = await depositV1.repository.create(
      deposit({ state: 'Completed', outcome: 'minted', createTime: at(11), updateTime: at(12) }),
    )

    expect(await activityV1.repository.get(bare.name)).toMatchObject({
      state: 'Pending',
      startTransaction: null,
      foreignChainTransaction: null,
      completeTransaction: null,
      updateTime: at(10),
    })
    expect(await activityV1.repository.get(completed.name)).toMatchObject({
      state: 'Complete',
      outcome: 'minted',
    })
    const listed = await activityV1.repository.search({
      criteria: [{ type: 'exact-text', field: 'depositAccount', text: depositAccount }],
      order: { field: 'createTime', direction: 'desc' },
    })
    expect(listed.map((activity) => activity.name)).toEqual([
      completed.name,
      bare.name,
      ...listed.slice(2).map((activity) => activity.name),
    ])
    expect(listed).toHaveLength(3)
  })
})
