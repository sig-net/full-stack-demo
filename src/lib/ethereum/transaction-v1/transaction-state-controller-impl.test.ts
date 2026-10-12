import { describe, expect, test } from 'vitest'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import {
  SIGNED_TX,
  TRANSACTION_IN_STATE,
  TRANSACTION_NAME,
  TX_HASH,
  VAULT_REQUEST_NAME,
} from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import {
  type CommitTransactionArgs,
  ETHEREUM_TRANSACTION_EVENT_BY_STATE,
  EthereumTransactionStateConflict,
  type EthereumTransactionStateController,
} from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import { EthereumTransactionStateControllerImpl } from '@/lib/ethereum/transaction-v1/transaction-state-controller-impl'
import type { Event } from '@/lib/event/event'
import type { EventPublisher } from '@/lib/event/event-publisher'
import { mock } from '@/lib/testing/mock'

interface Calls {
  created: EthereumTransaction[]
  updated: EthereumTransaction[]
  published: Event[]
}

/** A repository holding one row, and a publisher that records. Reads report the lock they took. */
function fields(stored: EthereumTransaction | undefined, calls: Calls, locks: string[] = []) {
  return {
    transactionRepository: mock<EthereumTransactionRepository>('EthereumTransactionRepository', {
      create: async (transaction) => {
        calls.created.push(transaction)
        return transaction
      },
      search: async (args) => {
        locks.push(args.lock ?? 'none')
        expect(args.criteria).toEqual([
          { type: 'exact-text', field: 'name', text: TRANSACTION_NAME },
        ])
        return stored === undefined ? [] : [stored]
      },
      update: async (transaction) => {
        calls.updated.push(transaction)
        return transaction
      },
    }),
    eventPublisher: mock<EventPublisher>('EventPublisher', {
      publishEvent: async (event) => {
        calls.published.push(event)
      },
    }),
  }
}

function controllerOver(
  stored: EthereumTransaction | undefined,
  calls: Calls,
  locks: string[] = [],
) {
  const { transactionRepository, eventPublisher } = fields(stored, calls, locks)
  return new EthereumTransactionStateControllerImpl(transactionRepository, eventPublisher)
}

function emptyCalls(): Calls {
  return { created: [], updated: [], published: [] }
}

describe('EthereumTransactionStateControllerImpl.commitTransaction', () => {
  const args: CommitTransactionArgs = {
    name: TRANSACTION_NAME,
    parent: VAULT_REQUEST_NAME,
    signedTx: SIGNED_TX,
    expireTime: new Date('2100-01-01T00:00:00Z'),
  }

  const cases: ReadonlyArray<{
    name: string
    args: CommitTransactionArgs
    create?: EthereumTransactionRepository['create']
    check: (result: Promise<EthereumTransaction>, calls: Calls, before: number) => Promise<void>
  }> = [
    {
      name: 'success - stored in AwaitingSubmission with the fields the chain fills unset',
      args,
      check: async (result, calls, before) => {
        const stored = await result
        expect(stored).toEqual({
          ...args,
          state: 'AwaitingSubmission',
          txHash: null,
          blockNumber: null,
          failure: null,
          error: null,
          createTime: stored.createTime,
          updateTime: stored.createTime,
        })
        expect(stored.createTime.getTime()).toBeGreaterThanOrEqual(before)
        expect(calls.created).toEqual([stored])
        expect(calls.published).toHaveLength(1)
        expect(calls.published[0]).toMatchObject({
          type: ETHEREUM_TRANSACTION_EVENT_BY_STATE.AwaitingSubmission.type,
          key: TRANSACTION_NAME,
          data: { name: TRANSACTION_NAME, parent: VAULT_REQUEST_NAME },
        })
      },
    },
    {
      name: 'success - without an expiry',
      args: { ...args, expireTime: null },
      check: async (result, calls) => {
        expect((await result).expireTime).toBeNull()
        expect(calls.published[0]?.type).toBe(
          ETHEREUM_TRANSACTION_EVENT_BY_STATE.AwaitingSubmission.type,
        )
      },
    },
    {
      name: 'failure - the repository refuses the row, so nothing is published',
      args,
      create: async () => {
        throw new Error(`${TRANSACTION_NAME} already exists`)
      },
      check: async (result, calls) => {
        await expect(result).rejects.toThrow('already exists')
        expect(calls.published).toHaveLength(0)
      },
    },
  ]

  test.each(cases)('$name', async ({ args: commitArgs, create, check }) => {
    const calls = emptyCalls()
    const { transactionRepository, eventPublisher } = fields(undefined, calls)
    const controller = new EthereumTransactionStateControllerImpl(
      create === undefined
        ? transactionRepository
        : mock<EthereumTransactionRepository>('EthereumTransactionRepository', { create }),
      eventPublisher,
    )
    const before = Date.now()
    await check(controller.commitTransaction(commitArgs), calls, before)
  })
})

describe('EthereumTransactionStateControllerImpl transitions', () => {
  type Transition = (controller: EthereumTransactionStateController) => Promise<EthereumTransaction>

  const cases: ReadonlyArray<{
    name: string
    from: EthereumTransaction
    transition: Transition
    to: EthereumTransaction['state']
    patch: Partial<EthereumTransaction>
  }> = [
    {
      name: 'recordSubmission',
      from: TRANSACTION_IN_STATE.AwaitingSubmission,
      transition: (c) => c.recordSubmission({ name: TRANSACTION_NAME, txHash: TX_HASH }),
      to: 'AwaitingInclusion',
      patch: { txHash: TX_HASH },
    },
    {
      name: 'recordSuccess',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) => c.recordSuccess({ name: TRANSACTION_NAME, blockNumber: 42n }),
      to: 'Succeeded',
      patch: { blockNumber: 42n },
    },
    {
      name: 'recordRejection from AwaitingSubmission',
      from: TRANSACTION_IN_STATE.AwaitingSubmission,
      transition: (c) => c.recordRejection({ name: TRANSACTION_NAME, error: 'invalid sender' }),
      to: 'Failed',
      patch: { failure: 'Rejected', error: 'invalid sender' },
    },
    {
      name: 'recordFailure as Reverted from AwaitingInclusion keeps the block',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) =>
        c.recordFailure({ name: TRANSACTION_NAME, failure: 'Reverted', blockNumber: 42n }),
      to: 'Failed',
      patch: { failure: 'Reverted', blockNumber: 42n },
    },
    {
      name: 'recordFailure as NonceConsumed from AwaitingInclusion',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) => c.recordFailure({ name: TRANSACTION_NAME, failure: 'NonceConsumed' }),
      to: 'Failed',
      patch: { failure: 'NonceConsumed' },
    },
    {
      name: 'expireTransaction from AwaitingSubmission',
      from: TRANSACTION_IN_STATE.AwaitingSubmission,
      transition: (c) => c.expireTransaction({ name: TRANSACTION_NAME }),
      to: 'Failed',
      patch: { failure: 'Expired' },
    },
    {
      name: 'expireTransaction from AwaitingInclusion',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) => c.expireTransaction({ name: TRANSACTION_NAME }),
      to: 'Failed',
      patch: { failure: 'Expired' },
    },
  ]

  test.each(cases)(
    '$name applies, locks the row and publishes the entered state',
    async ({ from, transition, to, patch }) => {
      const calls = emptyCalls()
      const locks: string[] = []
      const stored = await transition(controllerOver(from, calls, locks))
      expect(locks).toEqual(['update'])
      expect(stored).toEqual({ ...from, ...patch, state: to, updateTime: stored.updateTime })
      expect(stored.updateTime.getTime()).toBeGreaterThan(from.updateTime.getTime())
      expect(calls.updated).toEqual([stored])
      expect(calls.published).toHaveLength(1)
      expect(calls.published[0]).toMatchObject({
        type: ETHEREUM_TRANSACTION_EVENT_BY_STATE[to].type,
        key: TRANSACTION_NAME,
        data: { name: TRANSACTION_NAME, parent: VAULT_REQUEST_NAME },
      })
    },
  )

  const refused: ReadonlyArray<{
    name: string
    from: EthereumTransaction
    transition: Transition
  }> = [
    {
      name: 'recordSubmission once already submitted',
      from: TRANSACTION_IN_STATE.AwaitingInclusion,
      transition: (c) => c.recordSubmission({ name: TRANSACTION_NAME, txHash: TX_HASH }),
    },
    {
      name: 'recordSuccess before submission',
      from: TRANSACTION_IN_STATE.AwaitingSubmission,
      transition: (c) => c.recordSuccess({ name: TRANSACTION_NAME, blockNumber: 1n }),
    },
    {
      name: 'recordFailure on a terminal transaction',
      from: TRANSACTION_IN_STATE.Succeeded,
      transition: (c) => c.recordFailure({ name: TRANSACTION_NAME, failure: 'NonceConsumed' }),
    },
    {
      name: 'expireTransaction on a terminal transaction',
      from: TRANSACTION_IN_STATE.Failed,
      transition: (c) => c.expireTransaction({ name: TRANSACTION_NAME }),
    },
  ]

  test.each(refused)(
    '$name is a state conflict that writes and publishes nothing',
    async ({ from, transition }) => {
      const calls = emptyCalls()
      await expect(transition(controllerOver(from, calls))).rejects.toBeInstanceOf(
        EthereumTransactionStateConflict,
      )
      expect(calls.updated).toHaveLength(0)
      expect(calls.published).toHaveLength(0)
    },
  )

  test('a transition on a missing transaction throws', async () => {
    const calls = emptyCalls()
    await expect(
      controllerOver(undefined, calls).recordSuccess({ name: TRANSACTION_NAME, blockNumber: 1n }),
    ).rejects.toThrow(`${TRANSACTION_NAME} does not exist`)
  })
})
