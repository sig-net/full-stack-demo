import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import type { Approval } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import type { Redeem } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import type { Supply } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { Swap } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { VaultRequest } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import type { Withdraw } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
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
    recipient: null,
    outcome: null,
    failure: null,
    error: null,
    createTime: at(0),
    updateTime: at(0),
    ...overrides,
  })

  const withdraw = (overrides: Partial<Withdraw> = {}): Withdraw => ({
    name: `${caller}/ethereum-erc20-vault-withdraws/${randomUUID()}`,
    erc20Address: `0x${'ab'.repeat(20)}`,
    amount: 7n,
    destEvmAddress: `0x${'d1'.repeat(20)}`,
    state: 'AwaitingStartTransaction',
    inIndex: 4n,
    vaultAccount: `0x${'cc'.repeat(20)}`,
    outcome: null,
    failure: null,
    error: null,
    createTime: at(15),
    updateTime: at(15),
    ...overrides,
  })

  const supply = (overrides: Partial<Supply> = {}): Supply => ({
    name: `${caller}/ethereum-erc20-vault-supplies/${randomUUID()}`,
    underlyingErc20Address: `0x${'ab'.repeat(20)}`,
    stataErc20Address: `0x${'5a'.repeat(20)}`,
    amount: 8n,
    state: 'AwaitingStartTransaction',
    inIndex: 5n,
    vaultAccount: `0x${'cc'.repeat(20)}`,
    outcome: null,
    failure: null,
    error: null,
    createTime: at(16),
    updateTime: at(16),
    ...overrides,
  })

  const redeem = (overrides: Partial<Redeem> = {}): Redeem => ({
    name: `${caller}/ethereum-erc20-vault-redeems/${randomUUID()}`,
    stataErc20Address: `0x${'5a'.repeat(20)}`,
    underlyingErc20Address: `0x${'ab'.repeat(20)}`,
    shares: 3n,
    state: 'AwaitingStartTransaction',
    inIndex: 6n,
    vaultAccount: `0x${'cc'.repeat(20)}`,
    outcome: null,
    failure: null,
    error: null,
    createTime: at(17),
    updateTime: at(17),
    ...overrides,
  })

  const swap = (overrides: Partial<Swap> = {}): Swap => ({
    name: `${caller}/ethereum-erc20-vault-swaps/${randomUUID()}`,
    erc20AddressIn: `0x${'ab'.repeat(20)}`,
    erc20AddressOut: `0x${'ba'.repeat(20)}`,
    fee: 500n,
    amountOut: 9n,
    amountInMaximum: 10n,
    state: 'AwaitingStartTransaction',
    inIndex: 2n,
    vaultAccount: `0x${'cc'.repeat(20)}`,
    outcome: null,
    failure: null,
    error: null,
    createTime: at(20),
    updateTime: at(20),
    ...overrides,
  })

  const approval = (overrides: Partial<Approval> = {}): Approval => ({
    name: `${caller}/ethereum-erc20-vault-approvals/${randomUUID()}`,
    kind: 'stata',
    erc20Address: `0x${'ab'.repeat(20)}`,
    spender: `0x${'0a'.repeat(20)}`,
    state: 'AwaitingStartTransaction',
    inIndex: 3n,
    vaultAccount: `0x${'cc'.repeat(20)}`,
    outcome: null,
    failure: null,
    error: null,
    createTime: at(30),
    updateTime: at(30),
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
    boundTx: null,
    finalizedTx: null,
    expireTime: null,
    txId: null,
    blockHeight: null,
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
    signerAccount: depositAccount,
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
      'midnight_ethereum_erc20_vault_withdraws_v1',
      'midnight_ethereum_erc20_vault_swaps_v1',
      'midnight_ethereum_erc20_vault_supplies_v1',
      'midnight_ethereum_erc20_vault_redeems_v1',
      'midnight_ethereum_erc20_vault_approvals_v1',
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
        blockHeight: 120,
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
      erc20Address: row.erc20Address,
      amount: 5n,
      erc20AddressOut: null,
      amountOut: null,
      spender: null,
      destination: null,
      outcome: null,
      error: null,
      resourceState: 'AwaitingCompleteTransaction',
      vaultRequestState: 'AwaitingAttestation',
      vaultRequestId: '22'.repeat(32),
      walletTransaction: null,
      startTransaction: {
        hash: 'start-2',
        blockNumber: 120,
        state: 'Succeeded',
        lifecycleState: 'Succeeded',
      },
      foreignChainTransaction: {
        hash: `0x${'33'.repeat(32)}`,
        blockNumber: 7,
        state: 'Succeeded',
        lifecycleState: 'Succeeded',
      },
      completeTransaction: {
        hash: 'complete-1',
        blockNumber: null,
        state: 'Pending',
        lifecycleState: 'AwaitingInclusion',
      },
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
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
    expect(listed.map((activity) => activity.name)).toEqual([
      completed.name,
      bare.name,
      ...listed.slice(2).map((activity) => activity.name),
    ])
    expect(listed).toHaveLength(3)
  })

  test('a withdrawal, a swap, a supply, a redeem and an approval project their own sides, and the start call of either approval circuit', async () => {
    const { midnight } = backend
    const { withdrawV1, swapV1, supplyV1, redeemV1, approvalV1, activityV1 } =
      midnight.ethereumErc20Vault
    const sent = await withdrawV1.repository.create(withdraw())
    const traded = await swapV1.repository.create(swap())
    const supplied = await supplyV1.repository.create(supply())
    const redeemed = await redeemV1.repository.create(redeem())
    const granted = await approvalV1.repository.create(approval())
    await midnight.transactionV1.repository.create(
      midnightTransaction(granted.name, 'startApproveStata', {
        state: 'AwaitingWallet',
        unprovenTx: null,
        unboundTx: 'bb',
        expireTime: at(40),
        createTime: at(31),
        updateTime: at(31),
      }),
    )

    expect(await activityV1.repository.get(sent.name)).toMatchObject({
      type: 'Withdraw',
      state: 'Pending',
      erc20Address: sent.erc20Address,
      amount: 7n,
      erc20AddressOut: null,
      amountOut: null,
      spender: null,
      destination: sent.destEvmAddress,
      resourceState: 'AwaitingStartTransaction',
    })
    expect(await activityV1.repository.get(traded.name)).toMatchObject({
      type: 'Swap',
      state: 'Pending',
      erc20Address: traded.erc20AddressIn,
      amount: 10n,
      erc20AddressOut: traded.erc20AddressOut,
      amountOut: 9n,
      spender: null,
      resourceState: 'AwaitingStartTransaction',
      startTransaction: null,
    })
    expect(await activityV1.repository.get(supplied.name)).toMatchObject({
      type: 'Supply',
      state: 'Pending',
      erc20Address: supplied.underlyingErc20Address,
      amount: 8n,
      erc20AddressOut: null,
      amountOut: null,
      spender: null,
      destination: supplied.stataErc20Address,
      resourceState: 'AwaitingStartTransaction',
    })
    expect(await activityV1.repository.get(redeemed.name)).toMatchObject({
      type: 'Redeem',
      state: 'Pending',
      erc20Address: redeemed.stataErc20Address,
      amount: 3n,
      erc20AddressOut: null,
      amountOut: null,
      spender: null,
      destination: redeemed.underlyingErc20Address,
      resourceState: 'AwaitingStartTransaction',
    })
    expect(await activityV1.repository.get(granted.name)).toMatchObject({
      type: 'Approval',
      state: 'Pending',
      erc20Address: granted.erc20Address,
      amount: null,
      spender: granted.spender,
      walletTransaction: { circuit: 'startApproveStata', expireTime: at(40) },
      startTransaction: {
        hash: null,
        blockNumber: null,
        state: 'Pending',
        lifecycleState: 'AwaitingWallet',
      },
    })
    const listed = await activityV1.repository.search({
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
    expect(listed.slice(0, 5).map((activity) => activity.type)).toEqual([
      'Approval',
      'Swap',
      'Redeem',
      'Supply',
      'Withdraw',
    ])
  })
})
